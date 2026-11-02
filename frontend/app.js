// This URL is public configuration, not a secret.
const API_BASE_URL = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? "http://localhost:8080"
  : "https://REPLACE-WITH-YOUR-CLOUD-RUN-URL";

const apiStatus = document.querySelector("#api-status");
const taskForm = document.querySelector("#task-form");
const taskTitle = document.querySelector("#task-title");
const taskList = document.querySelector("#task-list");
const message = document.querySelector("#message");
const refreshButton = document.querySelector("#refresh-button");

function setMessage(text, isError = false) {
  message.textContent = text;
  message.style.color = isError ? "#a12b25" : "#5c667a";
}

async function api(path, options = {}) {
  if (API_BASE_URL.includes("REPLACE-WITH-YOUR-CLOUD-RUN-URL")) {
    throw new Error("Set API_BASE_URL in frontend/app.js to your Cloud Run URL first.");
  }
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

async function checkHealth() {
  try {
    const data = await api("/api/health");
    apiStatus.textContent = `API connected · ${data.status}`;
    apiStatus.classList.remove("error");
  } catch (error) {
    apiStatus.textContent = "API not connected";
    apiStatus.classList.add("error");
    setMessage(error.message, true);
  }
}

function renderTasks(tasks) {
  taskList.replaceChildren();
  if (!tasks.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No tasks yet. Add your first task above.";
    taskList.append(empty);
    return;
  }

  for (const task of tasks) {
    const item = document.createElement("li");
    item.className = `task${task.completed ? " done" : ""}`;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = task.completed;
    checkbox.setAttribute("aria-label", `Mark ${task.title} complete`);
    checkbox.addEventListener("change", async () => {
      try {
        await api(`/api/tasks/${task.id}`, {
          method: "PATCH",
          body: JSON.stringify({ completed: checkbox.checked }),
        });
        await loadTasks();
      } catch (error) {
        setMessage(error.message, true);
        checkbox.checked = !checkbox.checked;
      }
    });

    const title = document.createElement("span");
    title.className = "task-title";
    title.textContent = task.title;

    const remove = document.createElement("button");
    remove.className = "delete";
    remove.type = "button";
    remove.textContent = "Delete";
    remove.addEventListener("click", async () => {
      try {
        await api(`/api/tasks/${task.id}`, { method: "DELETE" });
        setMessage("Task deleted.");
        await loadTasks();
      } catch (error) {
        setMessage(error.message, true);
      }
    });

    item.append(checkbox, title, remove);
    taskList.append(item);
  }
}

async function loadTasks() {
  taskList.innerHTML = '<li class="empty">Loading tasks…</li>';
  try {
    const data = await api("/api/tasks");
    renderTasks(data.tasks);
  } catch (error) {
    taskList.replaceChildren();
    const item = document.createElement("li");
    item.className = "empty";
    item.textContent = `Could not load tasks: ${error.message}`;
    taskList.append(item);
  }
}

taskForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = taskTitle.value.trim();
  if (!title) return;

  const submit = taskForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    await api("/api/tasks", {
      method: "POST",
      body: JSON.stringify({ title }),
    });
    taskTitle.value = "";
    setMessage("Task added.");
    await loadTasks();
  } catch (error) {
    setMessage(error.message, true);
  } finally {
    submit.disabled = false;
  }
});

refreshButton.addEventListener("click", loadTasks);
checkHealth();
loadTasks();
