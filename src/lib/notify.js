// Task notification builders + email delivery (professional task comms).
// Pure builders are unit-tested; sendTaskEmail is best-effort fire-and-forget
// (EmailJS, same pattern as appointment reminders) and never throws.
export function taskTitle(task) {
  return String(task?.task || "Task").slice(0, 80);
}

export function workerDisplayName(worker) {
  if (!worker) return "a team member";
  return String(worker.name || worker.email || "a team member").slice(0, 60);
}

// Inbox row for the assignee when a task is created/assigned. Pure.
// Note: no shop_id here — insertRow() auto-injects it from the session.
export function buildTaskAssignedNotification({ task, worker, author }) {
  const wEmail = String(worker?.email || "").trim().toLowerCase();
  if (!wEmail || !task?.id) return null;
  const title = `New task: ${taskTitle(task)}`;
  const when = [task?.date, task?.time].filter(Boolean).join(" ");
  return {
    user_email: wEmail,
    type: "task_assigned",
    title,
    body: `${workerDisplayName(worker)}, ${author?.name || "your shop"} assigned you "${taskTitle(task)}"${when ? ` on ${when}` : ""}.`.slice(0, 280),
    taskId: String(task.id),
  };
}

// Inbox row for the assignee (and thread followers) when someone replies.
// Recipients are computed by the caller; this builds one row per recipient.
export function buildTaskReplyNotification({ task, worker, recipientEmail, author }) {
  const to = String(recipientEmail || "").trim().toLowerCase();
  if (!to || !task?.id) return null;
  const from = String(author?.name || author?.email || "A teammate");
  if (to === String(author?.email || "").trim().toLowerCase()) return null;
  return {
    user_email: to,
    type: "task_reply",
    title: `Reply on: ${taskTitle(task)}`,
    body: `${from} replied on "${taskTitle(task)}" (${workerDisplayName(worker)}).`.slice(0, 280),
    taskId: String(task.id),
  };
}

export function isTaskEmailConfigured() {
  return Boolean(
    process.env.REACT_APP_EMAILJS_SERVICE_ID &&
      process.env.REACT_APP_EMAILJS_TEMPLATE_ID &&
      process.env.REACT_APP_EMAILJS_USER_ID
  );
}

// Fire-and-forget task email (assignment or reply). Resolves true if sent,
// false otherwise — never rejects, never blocks the UI.
export async function sendTaskEmail({ toEmail, subject, message, task, worker, shopName }) {
  try {
    const to = String(toEmail || "").trim();
    if (!to || !to.includes("@")) return false;
    if (!isTaskEmailConfigured()) return false;
    const serviceId = process.env.REACT_APP_EMAILJS_SERVICE_ID;
    const templateId = process.env.REACT_APP_EMAILJS_TEMPLATE_ID;
    const userId = process.env.REACT_APP_EMAILJS_USER_ID;
    const mod = await import("emailjs-com");
    const send = mod.send || (mod.default && mod.default.send);
    if (typeof send !== "function") return false;
    await send(
      serviceId,
      templateId,
      {
        to_email: to,
        to_name: worker?.name || to.split("@")[0],
        subject: subject || `New task: ${taskTitle(task)}`,
        message: message || "",
        task: taskTitle(task),
        details: task?.details || "",
        date: task?.date || "",
        time: task?.time || "",
        worker_name: worker?.name || "",
        shop_name: shopName || "",
      },
      userId
    );
    return true;
  } catch (e) {
    return false;
  }
}
