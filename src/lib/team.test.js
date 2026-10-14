import { TEAM_ROLES, INVITE_ROLES, getWorkerPermissions, isInviteRole } from "./team";

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
