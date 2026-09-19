const loginCard =
  document.querySelector("#loginCard");

const contentForm =
  document.querySelector("#contentForm");

const message =
  document.querySelector("#message");

const loginButton =
  document.querySelector("#loginButton");

const saveButton =
  document.querySelector("#saveButton");

const bannerPreview =
  document.querySelector("#bannerPreview");

let csrf = "";

function showMessage(
  text,
  error = false
) {
  message.style.display = "block";

  message.style.color =
    error
      ? "#ffb4ab"
      : "#8ff0a4";

  message.textContent =
    String(text || "");
}

function clearMessage() {
  message.style.display = "none";
  message.textContent = "";
}

async function api(
  path,
  options = {}
) {
  const method =
    String(
      options.method || "GET"
    ).toUpperCase();

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
    headers["x-csrf-token"] =
      csrf;
  }

  const response =
    await fetch(
      `/api/${path}`,
      {
        credentials: "same-origin",
        ...options,
        method,
        headers
      }
    );

  const data =
    await response
      .json()
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

function toDateTimeLocal(
  milliseconds
) {
  const timestamp =
    Number(milliseconds || 0);

  if (!timestamp) {
    return "";
  }

  const date =
    new Date(timestamp);

  const offset =
    date.getTimezoneOffset() *
    60_000;

  return new Date(
    timestamp - offset
  )
    .toISOString()
    .slice(0, 16);
}

function fromDateTimeLocal(
  value
) {
  if (!value) {
    return 0;
  }

  const timestamp =
    new Date(value).getTime();

  return Number.isFinite(timestamp)
    ? timestamp
    : 0;
}

function showAdmin() {
  loginCard.style.display = "none";
  contentForm.style.display = "block";
}

function showLogin() {
  loginCard.style.display = "block";
  contentForm.style.display = "none";
}

function fillForm(data) {
  const banner =
    data.banner || {};

  const notice =
    data.notice || {};

  document.querySelector(
    "#bannerEnabled"
  ).checked =
    Boolean(banner.enabled);

  document.querySelector(
    "#bannerUrl"
  ).value =
    banner.url || "";

  document.querySelector(
    "#bannerLink"
  ).value =
    banner.link || "";

  document.querySelector(
    "#bannerVersion"
  ).value =
    banner.version || "1";

  document.querySelector(
    "#noticeEnabled"
  ).checked =
    Boolean(notice.enabled);

  document.querySelector(
    "#noticeId"
  ).value =
    notice.id || "";

  document.querySelector(
    "#noticeTitle"
  ).value =
    notice.title || "အသိပေးချက်";

  document.querySelector(
    "#noticeMessage"
  ).value =
    notice.message || "";

  document.querySelector(
    "#noticeStart"
  ).value =
    toDateTimeLocal(
      notice.startAt
    );

  document.querySelector(
    "#noticeEnd"
  ).value =
    toDateTimeLocal(
      notice.endAt
    );
}

async function loadSettings() {
  const data =
    await api(
      "admin/app-content"
    );

  fillForm(data);
}

async function initialize() {
  try {
    const data =
      await api("auth/me");

    if (
      data.user?.role !== "admin"
    ) {
      showLogin();
      return;
    }

    csrf =
      data.csrf || "";

    showAdmin();
    await loadSettings();
  } catch (error) {
    showLogin();

    showMessage(
      error.message,
      true
    );
  }
}

async function loginAdmin() {
  try {
    clearMessage();

    const identity =
      document
        .querySelector("#identity")
        .value
        .trim();

    const password =
      document
        .querySelector("#password")
        .value;

    if (!identity || !password) {
      throw new Error(
        "Admin username/email နှင့် password ထည့်ပါ"
      );
    }

    loginButton.disabled = true;
    loginButton.textContent =
      "Logging in...";

    const data =
      await api(
        "auth/login",
        {
          method: "POST",

          body: JSON.stringify({
            identity,
            password,
            turnstileToken: "",
            deviceId:
              "cmflix-app-content-admin"
          })
        }
      );

    if (
      data.user?.role !== "admin"
    ) {
      throw new Error(
        "Admin account မဟုတ်ပါ"
      );
    }

    csrf =
      data.csrf || "";

    document.querySelector(
      "#password"
    ).value = "";

    showAdmin();
    await loadSettings();

    showMessage(
      "Admin login အောင်မြင်ပါသည်"
    );
  } catch (error) {
    showMessage(
      error.message,
      true
    );
  } finally {
    loginButton.disabled = false;
    loginButton.textContent =
      "Login";
  }
}

loginButton.addEventListener(
  "click",
  loginAdmin
);

document
  .querySelector("#password")
  .addEventListener(
    "keydown",
    event => {
      if (event.key === "Enter") {
        loginAdmin();
      }
    }
  );

document
  .querySelector("#previewButton")
  .addEventListener(
    "click",
    () => {
      const url =
        document
          .querySelector("#bannerUrl")
          .value
          .trim();

      if (!url) {
        bannerPreview.style.display =
          "none";

        showMessage(
          "Preview အတွက် banner URL ထည့်ပါ",
          true
        );

        return;
      }

      bannerPreview.src = url;
      bannerPreview.style.display =
        "block";
    }
  );

bannerPreview.addEventListener(
  "error",
  () => {
    showMessage(
      "Banner ပုံကို load မလုပ်နိုင်ပါ။ URL စစ်ပါ",
      true
    );
  }
);

contentForm.addEventListener(
  "submit",
  async event => {
    event.preventDefault();

    try {
      clearMessage();

      const bannerEnabled =
        document.querySelector(
          "#bannerEnabled"
        ).checked;

      const bannerUrl =
        document.querySelector(
          "#bannerUrl"
        ).value.trim();

      const bannerLink =
        document.querySelector(
          "#bannerLink"
        ).value.trim();

      let bannerVersion =
        document.querySelector(
          "#bannerVersion"
        ).value.trim();

      const noticeEnabled =
        document.querySelector(
          "#noticeEnabled"
        ).checked;

      let noticeId =
        document.querySelector(
          "#noticeId"
        ).value.trim();

      const noticeTitle =
        document.querySelector(
          "#noticeTitle"
        ).value.trim();

      const noticeMessage =
        document.querySelector(
          "#noticeMessage"
        ).value.trim();

      const noticeStartAt =
        fromDateTimeLocal(
          document.querySelector(
            "#noticeStart"
          ).value
        );

      const noticeEndAt =
        fromDateTimeLocal(
          document.querySelector(
            "#noticeEnd"
          ).value
        );

      if (!bannerVersion) {
        bannerVersion =
          String(Date.now());
      }

      if (!noticeId) {
        noticeId =
          String(Date.now());
      }

      saveButton.disabled = true;
      saveButton.textContent =
        "Saving...";

      const data =
        await api(
          "admin/app-content",
          {
            method: "PUT",

            body: JSON.stringify({
              banner: {
                enabled:
                  bannerEnabled,

                url:
                  bannerUrl,

                link:
                  bannerLink,

                version:
                  bannerVersion
              },

              notice: {
                enabled:
                  noticeEnabled,

                id:
                  noticeId,

                title:
                  noticeTitle,

                message:
                  noticeMessage,

                startAt:
                  noticeStartAt,

                endAt:
                  noticeEndAt
              }
            })
          }
        );

      fillForm(data);

      showMessage(
        data.message ||
        "Settings သိမ်းပြီးပါပြီ"
      );
    } catch (error) {
      showMessage(
        error.message,
        true
      );
    } finally {
      saveButton.disabled = false;
      saveButton.textContent =
        "Save App Settings";
    }
  }
);

initialize();
