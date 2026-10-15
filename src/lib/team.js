// Team & shop membership logic (multi-tenant, shared backend).
// Signup-creates-shop: the shop creator becomes its Admin. Admins invite by
// email; the invitee adopts the invited role on first sign-in with that email.
// Strangers get a Staff seat and wait for admin approval. Deactivated users
// are blocked at login.
import { supabase } from "./supabaseClient";
import {
  isSupabaseConfigured,
  insertRow,
  setCurrentShopId,
  getCurrentShopId,
} from "./store";

export const TEAM_ROLES = ["Admin", "Technician", "Sales", "Staff"];
export const INVITE_ROLES = ["Technician", "Sales", "Staff"];

const normEmail = (v) => String(v || "").trim().toLowerCase();

// All profile rows this login can see: own id + matching email (invites).
async function fetchMyProfiles(authId, email) {
  const out = new Map();
  try {
    if (authId) {
      const { data } = await supabase.from("profiles").select("*").eq("id", authId);
      (data || []).forEach((r) => r && out.set(r.id, r));
    }
    if (email) {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .ilike("email", email);
      (data || []).forEach((r) => {
        if (r && String(r.email || "").toLowerCase() === email.toLowerCase()) {
          out.set(r.id, r);
        }
      });
    }
  } catch (e) {
    // fall through with whatever was collected
  }
  return Array.from(out.values());
}

// Adopt an admin-invited row (created before this auth user existed) by
// moving it onto the auth id so id-based lookups keep working. Harmless if
// RLS denies it: membership also resolves by email (see my_shop_ids()).
async function adoptInviteRow(row, authId) {
  try {
    const { error } = await supabase
      .from("profiles")
      .update({ id: authId })
      .eq("id", row.id);
    if (error) return row;
    return { ...row, id: authId };
  } catch (e) {
    return row;
  }
}

function toMembership(row) {
  return {
    profileId: row.id,
    shopId: row.shop_id,
    shopName: row.shop_name || "",
    role: row.role || "Staff",
    invited: Boolean(row.invited),
  };
}

// Resolve which shops this auth user can enter. Returns:
// { blocked } | { memberships: [...] } (empty = must create a shop)
export async function resolveShopMemberships(authUser) {
  if (!isSupabaseConfigured() || !authUser) return null; // offline: local behavior
  const email = normEmail(authUser.email);
  const rows = await fetchMyProfiles(authUser.id, email);
  if (rows.length === 0) return { memberships: [] };

  const active = rows.filter((r) => r.active !== false);
  if (active.length === 0) return { blocked: true };

  const memberships = [];
  for (const row of active) {
    let current = row;
    // Invite created before registration: adopt it onto the auth id.
    if (String(row.id) !== String(authUser.id) && row.invited) {
      current = await adoptInviteRow(row, authUser.id);
    }
    if (!current.shop_id) continue;
    memberships.push(toMembership(current));
  }
  // De-dupe by shop (keep strongest role: Admin wins).
  const rank = { Admin: 4, Sales: 3, Technician: 3, Staff: 1 };
  const byShop = new Map();
  memberships.forEach((m) => {
    const prev = byShop.get(m.shopId);
    if (!prev || (rank[m.role] || 0) > (rank[prev.role] || 0)) byShop.set(m.shopId, m);
  });
  return { memberships: Array.from(byShop.values()) };
}

// First screen after auth for a shop-less login: create the shop; creator
// becomes Admin automatically — this is the per-shop bootstrap.
export async function createShop(authUser, shopName, displayName) {
  const name = String(shopName || "").trim();
  if (!name) throw new Error("Shop name is required.");
  // Block generic demo names so no more demo shops pile up.
  const lowered = name.toLowerCase();
  if (["blackwheel", "demo", "test", "my shop", "shop"].includes(lowered)) {
    throw new Error("Please enter your real shop name (demo names are not allowed).");
  }
  if (!isSupabaseConfigured()) throw new Error("Shop creation needs Supabase.");
  const { data: shop, error: shopError } = await supabase
    .from("shops")
    .insert({ name, created_by: authUser.id })
    .select()
    .single();
  if (shopError) throw new Error(shopError.message);
  const profile = {
    id: authUser.id,
    shopId: shop.id,
    shop_name: shop.name,
    email: normEmail(authUser.email),
    name: displayName || normEmail(authUser.email).split("@")[0],
    role: "Admin",
    invited: true,
    active: true,
  };
  const saved = await insertRow("profiles", profile);
  if (!saved) {
    // Shop exists but profile write failed — surface instead of half-state.
    throw new Error("Shop created but admin profile failed. Retry sign-in.");
  }
  setCurrentShopId(shop.id);
  return { shop, membership: toMembership({ ...profile, shop_id: shop.id, shop_name: shop.name }) };
}

// Default shop name for automatic provisioning: every account IS a shop.
// Pure (unit-tested) so signup can name the shop without a round-trip.
export function personalShopName(displayName, email) {
  let base = String(displayName || "").trim();
  if (!base && email) base = String(email).split("@")[0].trim();
  if (!base || base.toLowerCase() === "my") return "My Tire Shop";
  // Don't double-suffix ("Menis Shop" stays as-is).
  let name =
    /shop|store|duka|tire|garage|magari/i.test(base) ? base : `${base}'s Shop`;
  // Must pass createShop's demo-name guard below.
  if (["blackwheel", "demo", "test", "my shop", "shop"].includes(name.toLowerCase())) {
    name = `${base} Tire Shop`;
  }
  return name.slice(0, 60);
}

// Create the account's own shop (creator becomes Admin). Used automatically
// at first login so new users never face a manual shop-creation step.
export async function ensurePersonalShop(authUser, displayName) {
  if (!isSupabaseConfigured()) throw new Error("Shop creation needs Supabase.");
  if (!authUser) throw new Error("Login required.");
  const { membership } = await createShop(
    authUser,
    personalShopName(displayName, authUser.email),
    displayName || personalShopName(displayName, authUser.email)
  );
  return membership;
}

export function enterShop(membership) {
  if (membership) setCurrentShopId(membership.shopId);
  return membership || null;
}

export function currentShopId() {
  return getCurrentShopId();
}

// Centralized role permission matrix (prod-critical, unit-tested).
// Offline/single-device mode is admin (full access). Online:
// Admin = full, Technician = tasks assign/edit/status (no worker mgmt, no delete),
// Sales/Staff = read-only + export.
export function getWorkerPermissions(role, isOnline = true) {
  const r = role || "Staff";
  const isAdmin = !isOnline || r === "Admin";
  const isTechnician = r === "Technician";
  const canManageWorkers = isAdmin;
  const canAssignTasks = isAdmin || isTechnician;
  const canEditTasks = isAdmin || isTechnician;
  const canChangeStatus = isAdmin || isTechnician;
  const canDeleteTasks = isAdmin;
  return {
    role: r,
    isAdmin,
    isTechnician,
    canManageWorkers,
    canAssignTasks,
    canEditTasks,
    canChangeStatus,
    canDeleteTasks,
    readOnly: !canAssignTasks && !canManageWorkers,
  };
}

export function isInviteRole(role) {
  return INVITE_ROLES.includes(role);
}

// One person, one record: team logins and worker roster rows are matched by
// email. Invite roles double as worker positions.
export function roleToPosition(role) {
  return INVITE_ROLES.includes(role) ? role : "Staff";
}

export function positionToInviteRole(position) {
  const p = String(position || "").toLowerCase();
  if (p.includes("tech")) return "Technician";
  if (p.includes("sale")) return "Sales";
  return "Staff";
}

export function sameEmail(a, b) {
  const x = String(a || "").trim().toLowerCase();
  const y = String(b || "").trim().toLowerCase();
  return Boolean(x) && x === y;
}
