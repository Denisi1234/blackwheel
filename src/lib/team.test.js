import { TEAM_ROLES, INVITE_ROLES, getWorkerPermissions, isInviteRole, personalShopName, roleToPosition, positionToInviteRole, sameEmail, findRosterGaps } from "./team";

test("team roles include all four, invites exclude Admin", () => {
  expect(TEAM_ROLES).toEqual(expect.arrayContaining(["Admin", "Technician", "Sales", "Staff"]));
  expect(INVITE_ROLES).not.toContain("Admin");
  expect(isInviteRole("Technician")).toBe(true);
  expect(isInviteRole("Admin")).toBe(false);
});

test("Admin has full worker permissions online", () => {
  const p = getWorkerPermissions("Admin", true);
  expect(p.canManageWorkers).toBe(true);
  expect(p.canAssignTasks).toBe(true);
  expect(p.canDeleteTasks).toBe(true);
  expect(p.readOnly).toBe(false);
});

test("Technician can work tasks but cannot manage workers or delete", () => {
  const p = getWorkerPermissions("Technician", true);
  expect(p.canAssignTasks).toBe(true);
  expect(p.canEditTasks).toBe(true);
  expect(p.canChangeStatus).toBe(true);
  expect(p.canManageWorkers).toBe(false);
  expect(p.canDeleteTasks).toBe(false);
});

test("Sales and Staff are read-only online", () => {
  for (const r of ["Sales", "Staff"]) {
    const p = getWorkerPermissions(r, true);
    expect(p.canAssignTasks).toBe(false);
    expect(p.canManageWorkers).toBe(false);
    expect(p.readOnly).toBe(true);
  }
});

test("offline mode is admin (full access)", () => {
  const p = getWorkerPermissions("Staff", false);
  expect(p.isAdmin).toBe(true);
  expect(p.canManageWorkers).toBe(true);
  expect(p.readOnly).toBe(false);
});

test("personal shop name derives from display name", () => {
  expect(personalShopName("Menis", "menis@example.com")).toBe("Menis's Shop");
});

test("personal shop name falls back to email prefix", () => {
  expect(personalShopName("", "menis@example.com")).toBe("menis's Shop");
  expect(personalShopName("", "shopowner@example.com")).toBe("shopowner");
  expect(personalShopName(null, null)).toBe("My Tire Shop");
});

test("personal shop name keeps existing shop-like names", () => {
  expect(personalShopName("Menis Tire Shop", "x@y.com")).toBe("Menis Tire Shop");
});

test("personal shop name passes the demo-name guard", () => {
  for (const base of ["demo", "test", "shop", "blackwheel"]) {
    const name = personalShopName(base, `${base}@x.com`).toLowerCase();
    expect(["blackwheel", "demo", "test", "my shop", "shop"]).not.toContain(name);
  }
});

test("personal shop name is capped at 60 chars", () => {
  expect(personalShopName("A".repeat(100), "x@y.com").length).toBeLessThanOrEqual(60);
});

test("roles double as worker positions", () => {
  expect(roleToPosition("Technician")).toBe("Technician");
  expect(roleToPosition("Sales")).toBe("Sales");
  expect(roleToPosition("Admin")).toBe("Staff");
  expect(roleToPosition("")).toBe("Staff");
});

test("positions map back to invite roles", () => {
  expect(positionToInviteRole("Tire technician")).toBe("Technician");
  expect(positionToInviteRole("Sales lead")).toBe("Sales");
  expect(positionToInviteRole("Tire fitter")).toBe("Staff");
  expect(positionToInviteRole("")).toBe("Staff");
});

test("sameEmail matches case-insensitively and rejects blanks", () => {
  expect(sameEmail("John@Shop.com", "john@shop.com")).toBe(true);
  expect(sameEmail("a@x.com", "b@x.com")).toBe(false);
  expect(sameEmail("", "a@x.com")).toBe(false);
  expect(sameEmail(null, null)).toBe(false);
});

test("findRosterGaps spots missing links both ways", () => {
  const profiles = [{ email: "a@x.com" }, { email: "B@x.com" }];
  const workers = [{ email: "b@x.com" }, { email: "c@x.com" }];
  const gaps = findRosterGaps(profiles, workers);
  expect(gaps.profilesWithoutWorker.map((p) => p.email)).toEqual(["a@x.com"]);
  expect(gaps.workersWithoutProfile.map((w) => w.email)).toEqual(["c@x.com"]);
  expect(findRosterGaps([], []).profilesWithoutWorker).toEqual([]);
  expect(findRosterGaps(null, null).workersWithoutProfile).toEqual([]);
});
