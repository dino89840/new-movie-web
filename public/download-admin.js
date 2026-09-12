const listElement =
  document.querySelector("#downloadList");

const searchElement =
  document.querySelector("#downloadSearch");

let csrf = "";
let items = [];

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function api(path, options = {}) {
  const method =
    String(options.method || "GET")
      .toUpperCase();

  const headers = {
    ...(options.body
      ? {
          "content-type":
            "application/json"
        }
      : {}),
    ...(options.headers || {})
  };

  if (
    csrf &&
    method !== "GET"
  ) {
    headers["x-csrf-token"] = csrf;
  }

  const response =
    await fetch(`/api/${path}`, {
      credentials: "same-origin",
      ...options,
      headers
    });

  const data =
    await response.json()
      .catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.message ||
      data.error ||
      "Request failed"
    );
  }

  return data;
}

function draw() {
  const query =
    searchElement.value
      .trim()
      .toLowerCase();

  const visibleItems =
    items.filter(item =>
      String(item.title || "")
        .toLowerCase()
        .includes(query)
    );

  if (!visibleItems.length) {
    listElement.innerHTML = `
      <div class="status-message">
        ဇာတ်ကားမတွေ့ပါ။
      </div>
    `;

    return;
  }

  listElement.innerHTML =
    visibleItems.map(item => `
      <section
        class="download-entry"
        data-title-id="${escapeHTML(item.id)}"
      >
        <h3>${escapeHTML(item.title)}</h3>

        <small>
          ${
            item.category === "series"
              ? "Free 18+"
              : "18+ VIP"
          }
          ·
          ${escapeHTML(item.status)}
        </small>

        <input
          class="download-url-input"
          type="url"
          placeholder="https://example.com/movie.mp4"
          value="${escapeHTML(item.download_url || "")}"
        >

        <button
          class="save-download-button"
          type="button"
        >
          Save Download Link
        </button>
      </section>
    `).join("");
}

async function saveEntry(entry) {
  const id =
    entry.dataset.titleId;

  const input =
    entry.querySelector(
      ".download-url-input"
    );

  const button =
    entry.querySelector(
      ".save-download-button"
    );

  button.disabled = true;
  button.textContent = "Saving…";

  try {
    await api(
      `admin/downloads/${encodeURIComponent(id)}`,
      {
        method: "PUT",
        body: JSON.stringify({
          downloadUrl:
            input.value.trim()
        })
      }
    );

    button.textContent = "Saved ✓";

    const item =
      items.find(current =>
        current.id === id
      );

    if (item) {
      item.download_url =
        input.value.trim();
    }

    setTimeout(() => {
      button.textContent =
        "Save Download Link";

      button.disabled = false;
    }, 1200);
  } catch (error) {
    alert(error.message);

    button.textContent =
      "Save Download Link";

    button.disabled = false;
  }
}

listElement.addEventListener(
  "click",
  event => {
    const button =
      event.target.closest(
        ".save-download-button"
      );

    if (!button) {
      return;
    }

    const entry =
      button.closest(
        ".download-entry"
      );

    if (entry) {
      saveEntry(entry);
    }
  }
);

searchElement.addEventListener(
  "input",
  draw
);

async function initialize() {
  try {
    const bootstrap =
      await api("bootstrap");

    if (
      !bootstrap.user ||
      bootstrap.user.role !== "admin"
    ) {
      listElement.innerHTML = `
        <div class="status-message">
          Admin account ဖြင့်
          အရင် login ဝင်ပါ။
          <br><br>
          <a href="/#/admin">
            Admin page သို့သွားရန်
          </a>
        </div>
      `;

      return;
    }

    csrf =
      bootstrap.csrf || "";

    const result =
      await api("admin/downloads");

    items =
      result.items || [];

    draw();
  } catch (error) {
    listElement.innerHTML = `
      <div class="status-message">
        ${escapeHTML(error.message)}
      </div>
    `;
  }
}

initialize();
