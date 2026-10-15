import {
  buildTaskAssignedNotification,
  buildTaskReplyNotification,
  isTaskEmailConfigured,
  sendTaskEmail,
} from "./notify";

test("assigned notification targets the worker email", () => {
  const n = buildTaskAssignedNotification({
    task: { id: "t1", task: "Fitting", date: "2026-10-20", time: "09:00" },
    worker: { email: "JOE@shop.com", name: "Joe" },
    shopId: "s1",
    author: { name: "Admin" },
  });
  expect(n.user_email).toBe("joe@shop.com");
  expect(n.type).toBe("task_assigned");
  expect(n.taskId).toBe("t1");
  expect(n.title).toMatch(/Fitting/);
});

test("assigned notification needs worker email and task id", () => {
  expect(
    buildTaskAssignedNotification({ task: { id: "t1" }, worker: { name: "NoMail" } })
  ).toBeNull();
  expect(
    buildTaskAssignedNotification({ task: {}, worker: { email: "a@x.com" } })
  ).toBeNull();
});

test("reply notification skips the author themselves", () => {
  expect(
    buildTaskReplyNotification({
      task: { id: "t1", task: "Repair" },
      worker: { name: "Joe" },
      recipientEmail: "joe@x.com",
      author: { email: "joe@x.com", name: "Joe" },
    })
  ).toBeNull();
  const n = buildTaskReplyNotification({
    task: { id: "t1", task: "Repair" },
    worker: { name: "Joe" },
    recipientEmail: "joe@x.com",
    author: { email: "boss@x.com", name: "Boss" },
  });
  expect(n.type).toBe("task_reply");
  expect(n.user_email).toBe("joe@x.com");
});

test("task email is a safe no-op without config or address", async () => {
  expect(isTaskEmailConfigured()).toBe(false);
  await expect(sendTaskEmail({ toEmail: "", task: {} })).resolves.toBe(false);
  await expect(sendTaskEmail({ toEmail: "a@x.com", task: { task: "x" } })).resolves.toBe(
    false
  );
});
