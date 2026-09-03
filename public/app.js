const app = document.querySelector("#app");
const authDialog = document.querySelector("#authDialog");
const authContent = document.querySelector("#authContent");
const accountButton = document.querySelector("#accountButton");
const playerDialog = document.querySelector("#playerDialog");
const player = document.querySelector("#videoPlayer");
const playerTitle = document.querySelector("#playerTitle");
const playerStatus = document.querySelector("#playerStatus");
const playerFullscreen = document.querySelector(
  "#playerFullscreen"
);
const toastElement = document.querySelector("#toast");

const state = {
  user: null,
  csrf: "",
  category: "movies",

  /*
   * လက်ရှိ HLS instance။
   */
  hls: null,

  /*
   * Native HLS/MP4 loadedmetadata listener ကို
   * video ပြောင်းချိန်မှာ ဖယ်ရှားနိုင်ဖို့ သိမ်းထားမယ်။
   */
  nativeReadyHandler: null,

  /*
   * Video တစ်ကားဖွင့်တိုင်း generation တိုးမယ်။
   * အရင် video ရဲ့ async callback တွေက
   * video အသစ်ကို မထိခိုက်နိုင်အောင် သုံးပါတယ်။
   */
  playbackGeneration: 0,
  activeVideoURL: "",

  editing: null,
  parsedEpisodes: [],
  catalogObserver: null,
  catalogRun: 0
};

const icons = {
  play: `
    <svg viewBox="0 0 24 24">
      <path d="m8 5 11 7-11 7Z"/>
    </svg>
  `,
  heart: `
    <svg viewBox="0 0 24 24">
      <path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4
      5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z"/>
    </svg>
  `
};

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toast(message) {
  toastElement.textContent = message;
  toastElement.classList.add("show");

  clearTimeout(toastElement.timer);
  toastElement.timer = setTimeout(
    () => toastElement.classList.remove("show"),
    2600
  );
}

async function api(path, options = {}) {
  const headers = {
    ...(options.body ? { "content-type": "application/json" } : {}),
    ...(options.headers || {})
  };

  if (
    state.csrf &&
    options.method &&
    options.method.toUpperCase() !== "GET"
  ) {
    headers["x-csrf-token"] = state.csrf;
  }

  const response = await fetch(`/api/${path}`, {
    credentials: "same-origin",
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || data.error || "Request failed");
  }

  return data;
}

async function initialize() {
  try {
    const bootstrap = await api("bootstrap");

    state.user = bootstrap.user;
    state.csrf = bootstrap.csrf || "";

    if (
      bootstrap.maintenance &&
      state.user?.role !== "admin"
    ) {
      renderMaintenance(bootstrap.message);
      return;
    }

    route();
  } catch (error) {
    console.error("Initialization error:", error);

    app.innerHTML = `
      <section class="empty-card">
        ${escapeHTML(error.message)}
      </section>
    `;
  }
}

function updateBottomNavigation(page) {
  let activePage = page;

  /*
   * Detail/watch page ထဲရောက်သွားရင်
   * အရင်ဖွင့်ခဲ့တဲ့ Movies, Series သို့မဟုတ် Lugyi ကို
   * active အဖြစ် ဆက်ပြထားမယ်။
   */
  if (page === "watch") {
    activePage = state.category || "movies";
  }

  document
    .querySelectorAll(".bottom-nav-item")
    .forEach(button => {
      const buttonPage =
        button.dataset.category ||
        button.dataset.page ||
        "";

      const isActive =
        buttonPage === activePage;

      button.classList.toggle(
        "active",
        isActive
      );

      if (isActive) {
        button.setAttribute(
          "aria-current",
          "page"
        );
      } else {
        button.removeAttribute(
          "aria-current"
        );
      }
    });
}

/*
 * Hash route ပြောင်းတဲ့အခါ browser က အရင် scroll position ကို
 * ဆက်သုံးတာ/ပြန်ယူတာ မဖြစ်အောင် manual လုပ်ထားမယ်။
 */
if ("scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}

/*
 * Android browser အပါအဝင် browser အမျိုးမျိုးမှာ
 * detail page ကို ထိပ်ဆုံးကနေ သေချာပြစေရန် scroll position ကို reset လုပ်မယ်။
 *
 * requestAnimationFrame နှစ်ဆင့်သုံးထားတာက
 * DOM render/layout ပြီးတဲ့နောက်လည်း ထပ်ပြီး ထိပ်ဆုံးထားနိုင်ဖို့ ဖြစ်တယ်။
 */
function resetPageScroll() {
  const scrollToTop = () => {
    window.scrollTo(0, 0);

    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  };

  scrollToTop();

  requestAnimationFrame(() => {
    scrollToTop();

    requestAnimationFrame(() => {
      scrollToTop();
    });
  });
}

function route() {
  const hash = location.hash || "#/movies";
  const parts = hash.slice(2).split("/").filter(Boolean);
  const page = parts[0] || "movies";

  /*
   * URL hash ပြောင်းတိုင်း bottom navigation ရဲ့
   * active item ကို ပြန်သတ်မှတ်မယ်။
   */
  updateBottomNavigation(page);

  if (["movies", "series", "lugyi"].includes(page)) {
    if (
      page === "lugyi" &&
      !localStorage.getItem("cmflix-adult-ok")
    ) {
      const accepted = confirm(
        "ဤအပိုင်းသည် အသက်ပြည့်ပြီးသူများအတွက် ဖြစ်နိုင်ပါသည်။ " +
        "သင်သည် သက်ဆိုင်ရာ အသက်ကန့်သတ်ချက် ပြည့်မီပါသလား?"
      );

      if (!accepted) {
        location.hash = "#/movies";
        return;
      }

      localStorage.setItem(
        "cmflix-adult-ok",
        "1"
      );
    }

    state.category = page;
    updateBottomNavigation(page);
    renderHome(page);
    return;
  }

  if (page === "watch" && parts[1]) {
    updateBottomNavigation("watch");

    /*
     * Movie/Series detail page ဝင်တာနဲ့
     * အရင် page ရဲ့ scroll position ကို မယူဘဲ
     * ချက်ချင်း ထိပ်ဆုံးပြမယ်။
     */
    resetPageScroll();

    renderDetail(
      decodeURIComponent(parts[1])
    );

    return;
  }

  if (page === "favorites") {
    updateBottomNavigation("favorites");
    renderFavorites();
    return;
  }

  if (page === "admin") {
    updateBottomNavigation("");
    renderAdmin();
    return;
  }

  location.hash = "#/movies";
}
function splitGenres(value) {
  if (Array.isArray(value)) {
    return value
      .map(item => String(item || "").trim())
      .filter(Boolean);
  }

  return String(value || "")
    .split(/[,|/]+/)
    .map(item => item.trim())
    .filter(Boolean);
}

function renderMovieItems(items) {
  return items.length
    ? items.map(movieCard).join("")
    : `
      <section class="empty-card full">
        ဇာတ်ကားမတွေ့ပါ
      </section>
    `;
}

async function renderHome(category) {
  const runId = ++state.catalogRun;

  state.catalogObserver?.disconnect();
  state.catalogObserver = null;

  app.innerHTML = `
    <section class="loading-card">
      Loading…
    </section>
  `;

  document
    .querySelectorAll("[data-category]")
    .forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.category === category
      );
    });

  let currentItems = [];
  let currentPage = 0;
  let hasMore = true;
  let loading = false;
  let activeGenre = "all";
  let currentQuery = "";
  let queryVersion = 0;

  const makeURL = page => {
    return (
      `titles?category=${encodeURIComponent(category)}` +
      `&q=${encodeURIComponent(currentQuery)}` +
      `&page=${page}`
    );
  };

  const firstData = await api(makeURL(1));

  if (runId !== state.catalogRun) {
    return;
  }

  currentItems = firstData.items || [];
  currentPage = 1;
  hasMore = Boolean(firstData.hasMore);

  const genres = [
    ...new Set(
      currentItems.flatMap(item =>
        splitGenres(item.genres)
      )
    )
  ].sort((a, b) => a.localeCompare(b));

  app.innerHTML = `

    <section class="catalog-section">
      <div class="section-header">
        <h2>
          ${escapeHTML(category.toUpperCase())}
        </h2>

        <input
          id="movieSearch"
          class="search-input"
          placeholder="ဇာတ်ကားရှာရန်…"
          autocomplete="off"
        >
      </div>

      ${
        genres.length
          ? `
            <div
              id="genreFilter"
              class="genre-filter"
              aria-label="Genre filters"
            >
              <button
                type="button"
                class="genre-chip active"
                data-genre="all"
              >
                All
              </button>

              ${genres.map(genre => `
                <button
                  type="button"
                  class="genre-chip"
                  data-genre="${escapeHTML(genre)}"
                >
                  ${escapeHTML(genre)}
                </button>
              `).join("")}
            </div>
          `
          : ""
      }

      <div id="movieGrid" class="movie-grid"></div>

      <div class="catalog-loader">
        <button
          id="catalogLoadMore"
          class="button secondary"
          type="button"
        >
          နောက်ထပ်ဇာတ်ကားများ
        </button>

        <p
          id="catalogStatus"
          class="muted catalog-status"
          aria-live="polite"
        ></p>
      </div>
    </section>
  `;

  const movieGrid =
    document.querySelector("#movieGrid");

  const loadMoreButton =
    document.querySelector("#catalogLoadMore");

  const catalogStatus =
    document.querySelector("#catalogStatus");

  const filteredItems = () => {
    if (activeGenre === "all") {
      return currentItems;
    }

    return currentItems.filter(item =>
      splitGenres(item.genres).some(
        genre =>
          genre.toLowerCase() ===
          activeGenre.toLowerCase()
      )
    );
  };

  const paintGrid = () => {
    movieGrid.innerHTML =
      renderMovieItems(filteredItems());

    loadMoreButton.hidden = !hasMore;

    if (!hasMore && currentItems.length) {
      catalogStatus.textContent =
        "ဇာတ်ကားအားလုံး ပြပြီးပါပြီ";
    } else if (!loading) {
      catalogStatus.textContent = "";
    }
  };

  const loadNextPage = async () => {
    if (loading || !hasMore) {
      return;
    }

    const version = queryVersion;
    const nextPage = currentPage + 1;

    loading = true;
    loadMoreButton.disabled = true;
    catalogStatus.textContent =
      "နောက်ထပ်ဇာတ်ကားများ ရယူနေသည်…";

    try {
      const data = await api(makeURL(nextPage));

      if (
        runId !== state.catalogRun ||
        version !== queryVersion
      ) {
        return;
      }

      const existingIDs = new Set(
        currentItems.map(item => item.id)
      );

      const newItems = (data.items || [])
        .filter(item => !existingIDs.has(item.id));

      currentItems.push(...newItems);
      currentPage = nextPage;
      hasMore = Boolean(data.hasMore);

      paintGrid();
    } catch (error) {
      if (
        runId === state.catalogRun &&
        version === queryVersion
      ) {
        catalogStatus.textContent = error.message;
      }
    } finally {
      if (
        runId === state.catalogRun &&
        version === queryVersion
      ) {
        loading = false;
        loadMoreButton.disabled = false;

        if (hasMore) {
          catalogStatus.textContent = "";
        }
      }
    }
  };

  const resetSearch = async query => {
    queryVersion++;

    const version = queryVersion;

    currentQuery = query;
    currentPage = 0;
    currentItems = [];
    hasMore = true;
    loading = true;

    movieGrid.innerHTML = `
      <section class="loading-card full">
        Loading…
      </section>
    `;

    loadMoreButton.disabled = true;
    catalogStatus.textContent = "";

    try {
      const data = await api(makeURL(1));

      if (
        runId !== state.catalogRun ||
        version !== queryVersion
      ) {
        return;
      }

      currentItems = data.items || [];
      currentPage = 1;
      hasMore = Boolean(data.hasMore);

      paintGrid();
    } catch (error) {
      if (
        runId === state.catalogRun &&
        version === queryVersion
      ) {
        movieGrid.innerHTML = `
          <section class="empty-card full">
            ${escapeHTML(error.message)}
          </section>
        `;
      }
    } finally {
      if (
        runId === state.catalogRun &&
        version === queryVersion
      ) {
        loading = false;
        loadMoreButton.disabled = false;
      }
    }
  };

  document
    .querySelector("#genreFilter")
    ?.addEventListener("click", event => {
      const button =
        event.target.closest("[data-genre]");

      if (!button) {
        return;
      }

      activeGenre = button.dataset.genre;

      document
        .querySelectorAll("[data-genre]")
        .forEach(item => {
          item.classList.toggle(
            "active",
            item === button
          );
        });

      paintGrid();
    });

  document
    .querySelector("#movieSearch")
    ?.addEventListener(
      "input",
      debounce(event => {
        resetSearch(event.target.value.trim());
      }, 450)
    );

  loadMoreButton.addEventListener(
    "click",
    loadNextPage
  );

  /*
   * Cloudflare Free plan request လျှော့ရန်
   * automatic infinite loading မသုံးတော့ပါ။
   * User က Load More နှိပ်မှ API request အသစ်လုပ်မယ်။
   */
  paintGrid();
}

function movieCard(item) {
  const categoryLabel =
    item.category === "series"
      ? "SERIES"
      : item.category === "lugyi"
        ? "18+"
        : "MOVIE";

  const year =
    item.year ||
    (item.release_date
      ? String(item.release_date).slice(0, 4)
      : "");

  const rating = Number(item.rating || 0);

  return `
    <article
      class="movie-card"
      data-open-title="${escapeHTML(item.slug || "")}"
      role="button"
      tabindex="0"
      aria-label="${escapeHTML(item.title || "Movie")}"
    >
      <div class="poster-wrap protected-media">
        ${
          item.poster_url
            ? `
              <img
                src="${escapeHTML(item.poster_url)}"
                alt="${escapeHTML(item.title || "")}"
                loading="lazy"
                decoding="async"
              >
            `
            : `
              <div class="poster-placeholder">
                No poster
              </div>
            `
        }

        <span class="type-badge">
          ${categoryLabel}
        </span>
      </div>

      <div class="movie-info">
        <h3>${escapeHTML(item.title || "Untitled")}</h3>

        <p>
          <span>${escapeHTML(year || "—")}</span>
          <span>★ ${rating.toFixed(1)}</span>
        </p>
      </div>
    </article>
  `;
}

function setupEpisodeBrowser(rawEpisodes) {
  const host =
    document.querySelector("#episodeBrowser");

  if (!host) {
    return;
  }

  const episodes = [...rawEpisodes].sort(
    (a, b) =>
      Number(a.season_number) -
        Number(b.season_number) ||
      Number(a.episode_number) -
        Number(b.episode_number)
  );

  const seasons = [
    ...new Set(
      episodes.map(episode =>
        positiveInteger(
          episode.season_number,
          1
        )
      )
    )
  ].sort((a, b) => a - b);

  const pageSize = 12;
  let activeSeason = seasons[0] || 1;
  let currentPage = 1;

  const draw = () => {
    const seasonEpisodes = episodes.filter(
      episode =>
        positiveInteger(
          episode.season_number,
          1
        ) === activeSeason
    );

    const totalPages = Math.max(
      1,
      Math.ceil(
        seasonEpisodes.length / pageSize
      )
    );

    currentPage = Math.min(
      Math.max(currentPage, 1),
      totalPages
    );

    const start =
      (currentPage - 1) * pageSize;

    const visibleEpisodes =
      seasonEpisodes.slice(
        start,
        start + pageSize
      );

    host.innerHTML = `
      <div class="episode-toolbar">
        <label class="season-selector">
          <span>Season</span>

          <select id="seasonSelect">
            ${seasons.map(season => `
              <option
                value="${season}"
                ${
                  season === activeSeason
                    ? "selected"
                    : ""
                }
              >
                Season ${season}
              </option>
            `).join("")}
          </select>
        </label>

        <span class="episode-count">
          ${seasonEpisodes.length} Episodes
        </span>
      </div>

      <div class="episode-grid">
        ${visibleEpisodes.map(episode => `
          <button
            type="button"
            class="episode-button"
            data-play-url="${escapeHTML(
              episode.video_url
            )}"
            data-play-type="${escapeHTML(
              episode.video_type || "auto"
            )}"
            data-play-name="${escapeHTML(
              `S${episode.season_number} ` +
              `E${episode.episode_number} ` +
              `${episode.episode_title || ""}`
            )}"
          >
            <strong>
              S${positiveInteger(
                episode.season_number,
                1
              )}
              E${positiveInteger(
                episode.episode_number,
                1
              )}
            </strong>

            <span class="muted">
              ${escapeHTML(
                episode.episode_title ||
                `Episode ${episode.episode_number}`
              )}
            </span>
          </button>
        `).join("")}
      </div>

      ${
        totalPages > 1
          ? `
            <div class="episode-pagination">
              <button
                type="button"
                class="button secondary small"
                data-episode-page="previous"
                ${currentPage <= 1 ? "disabled" : ""}
              >
                ← Previous
              </button>

              <span>
                ${currentPage} / ${totalPages}
              </span>

              <button
                type="button"
                class="button secondary small"
                data-episode-page="next"
                ${
                  currentPage >= totalPages
                    ? "disabled"
                    : ""
                }
              >
                Next →
              </button>
            </div>
          `
          : ""
      }
    `;

    host
      .querySelector("#seasonSelect")
      ?.addEventListener("change", event => {
        activeSeason = positiveInteger(
          event.target.value,
          seasons[0] || 1
        );

        currentPage = 1;
        draw();
      });

    host
      .querySelectorAll("[data-episode-page]")
      .forEach(button => {
        button.addEventListener("click", () => {
          if (
            button.dataset.episodePage ===
            "previous"
          ) {
            currentPage--;
          } else {
            currentPage++;
          }

          draw();

          host.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });
        });
      });
  };

  draw();
}

async function renderDetail(slug) {
  app.innerHTML = `
    <section class="loading-card">
      Loading…
    </section>
  `;

  try {
    const data = await api(
      `titles/${encodeURIComponent(slug)}`
    );

    const item = data.item;
    const episodes = item.episodes || [];
    const genres = splitGenres(item.genres);

    app.innerHTML = `
      <section
        class="detail-hero"
        style="--backdrop:url('${escapeHTML(
          item.backdrop_url ||
          item.poster_url ||
          ""
        )}')"
      >
        <div class="detail-content">
          ${
            item.poster_url
              ? `
                <img
                  class="detail-poster"
                  src="${escapeHTML(item.poster_url)}"
                  alt="${escapeHTML(item.title)}"
                >
              `
              : `
                <div class="detail-poster poster-placeholder">
                  No poster
                </div>
              `
          }

          <div class="detail-main">
            <p class="detail-label">
              ${
                item.category === "series"
                  ? "SERIES"
                  : item.category === "lugyi"
                    ? "18+"
                    : "MOVIE"
              }
            </p>

            <h1>${escapeHTML(item.title)}</h1>

            <div class="meta">
              <span>
                ${escapeHTML(item.year || "—")}
              </span>

              <span>
                ★ ${Number(item.rating || 0).toFixed(1)}
              </span>

              ${
                genres.length
                  ? `
                    <span>
                      ${escapeHTML(genres.slice(0, 2).join(" · "))}
                    </span>
                  `
                  : ""
              }
            </div>

            <div class="detail-actions">
              ${
                item.video_url
                  ? `
                    <button
                      class="button"
                      data-play-url="${escapeHTML(item.video_url)}"
                      data-play-type="${escapeHTML(
                        item.video_type || "auto"
                      )}"
                      data-play-name="${escapeHTML(item.title)}"
                    >
                      ${icons.play}
                      Play
                    </button>
                  `
                  : `
                    <button
                      class="button"
                      type="button"
                      disabled
                    >
                      အောက်တွင်အပိုင်းရွေးပါ
                    </button>
                  `
              }

              ${
                state.user
                  ? `
                    <button
                      class="button secondary"
                      data-favorite="${escapeHTML(item.id)}"
                    >
                      ${icons.heart}
                      Favorite
                    </button>
                  `
                  : ""
              }
            </div>
          </div>

          <div class="detail-overview">
  <h2>ဇာတ်လမ်းအကျဉ်း</h2>
  <p>${escapeHTML(
    String(
      item.overview ||
      "ဇာတ်လမ်းအကျဉ်း မရှိသေးပါ။"
    ).trim()
  )}</p>
</div>

        </div>
      </section>

      ${
        genres.length
          ? `
            <section class="detail-section">
              <div class="detail-section-heading">
                <h2>Genres</h2>
              </div>

              <div class="detail-genres">
                ${genres.map(genre => `
                  <span class="genre-chip static">
                    ${escapeHTML(genre)}
                  </span>
                `).join("")}
              </div>
            </section>
          `
          : ""
      }

      ${
  episodes.length
    ? `
      <section class="episode-section detail-section">
        <div class="detail-section-heading">
          <h2>Episodes</h2>
        </div>

        <div
          id="episodeBrowser"
          class="episode-browser"
        ></div>
      </section>
    `
    : ""
}

    `;

    /*
     * HTML ထဲမှာ #episodeBrowser ဖန်တီးပြီးမှ
     * episode buttons တွေ render လုပ်ရပါမယ်။
     */
    if (episodes.length) {
      setupEpisodeBrowser(episodes);
    }

    /*
     * API data ရပြီး detail cover/poster ကို DOM ထဲထည့်ပြီးနောက်
     * layout ပြောင်းသွားနိုင်တာကြောင့် scroll ကို ထပ် reset လုပ်မယ်။
     */
    resetPageScroll();
  } catch (error) {
    console.error("Detail page error:", error);

    app.innerHTML = `
      <section class="empty-card">
        ${escapeHTML(error.message)}
      </section>
    `;
  }
}



async function renderFavorites() {
  if (!state.user) {
    openAuth();
    return;
  }

  app.innerHTML = `
    <section class="loading-card">
      Loading favorites…
    </section>
  `;

  try {
    const data = await api("favorites");
    const items = data.items || [];

    app.innerHTML = `
      <div class="section-header">
        <h1>My Favorites</h1>
      </div>

      <div class="movie-grid">
        ${
          items.length
            ? items.map(item => `
                <div
                  class="favorite-entry"
                  data-favorite-entry="${escapeHTML(item.id)}"
                >
                  ${movieCard(item)}

                  <button
                    type="button"
                    class="button danger small favorite-remove-button"
                    data-remove-favorite="${escapeHTML(item.id)}"
                  >
                    Favorite မှ ဖယ်ရှားမည်
                  </button>
                </div>
              `).join("")
            : `
                <section class="empty-card full">
                  Favorite မရှိသေးပါ
                </section>
              `
        }
      </div>
    `;
  } catch (error) {
    app.innerHTML = `
      <section class="empty-card">
        ${escapeHTML(error.message)}
      </section>
    `;
  }
}

function openAuth(mode = "login") {
  if (state.user) {
    authContent.innerHTML = `
      <h2>${escapeHTML(state.user.username)}</h2>
      <p class="muted">${escapeHTML(state.user.email)}</p>

      ${
        state.user.role === "admin"
          ? `<button id="goAdmin" class="button">Admin Panel</button>`
          : ""
      }

      <button id="logoutButton" class="button secondary">
        Logout
      </button>
    `;
  } else {
    authContent.innerHTML = `
      <h2>${mode === "register" ? "Account ဖွင့်မည်" : "Login"}</h2>

      <form id="authForm" class="form-stack">
        ${
          mode === "register"
            ? `
              <label class="field">
                <span>Username</span>
                <input name="username" required minlength="3" maxlength="30">
              </label>

              <label class="field">
                <span>Email</span>
                <input name="email" type="email" required>
              </label>
            `
            : `
              <label class="field">
                <span>Username or email</span>
                <input name="identity" required>
              </label>
            `
        }

        <label class="field">
          <span>Password</span>
          <input name="password" type="password" required minlength="8">
        </label>

        <button class="button" type="submit">
          ${mode === "register" ? "Register" : "Login"}
        </button>
      </form>

      <button
        id="switchAuth"
        class="button secondary"
        type="button"
      >
        ${
          mode === "register"
            ? "Login ပြန်ဝင်မည်"
            : "Account အသစ်ဖွင့်မည်"
        }
      </button>
    `;

    document.querySelector("#switchAuth")?.addEventListener("click", () => {
      openAuth(mode === "register" ? "login" : "register");
    });

    document.querySelector("#authForm")?.addEventListener("submit", async event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const body = Object.fromEntries(form.entries());

      try {
        const result = await api(
          mode === "register" ? "auth/register" : "auth/login",
          {
            method: "POST",
            body: JSON.stringify(body)
          }
        );

        state.user = result.user;
        state.csrf = result.csrf;
        authDialog.close();
        toast("အောင်မြင်ပါသည်");
        route();
      } catch (error) {
        toast(error.message);
      }
    });
  }

  authDialog.showModal();
}

function setPlayerStatus(message = "", visible = false) {
  playerStatus.textContent = message;
  playerStatus.classList.toggle(
    "show",
    Boolean(visible && message)
  );
}

function destroyHLSPlayer() {
  /*
   * Native HLS/MP4 listener အဟောင်းရှိရင်
   * အသစ်ဖွင့်မယ့် video ကို မထိခိုက်ခင် ဖယ်ရှားပါမယ်။
   */
  if (state.nativeReadyHandler) {
    player.removeEventListener(
      "loadedmetadata",
      state.nativeReadyHandler
    );

    state.nativeReadyHandler = null;
  }

  /*
   * Global reference ကို အရင် null လုပ်ထားတာကြောင့်
   * destroy လုပ်နေစဉ် callback ထပ်ဝင်လာရင်
   * instance အသစ်ကို မထိနိုင်ပါ။
   */
  const oldHLS = state.hls;
  state.hls = null;

  if (!oldHLS) {
    return;
  }

  try {
    oldHLS.stopLoad();
  } catch {
    /*
     * HLS state အရ stopLoad မရလည်း ဆက်ရှင်းပါမယ်။
     */
  }

  try {
    oldHLS.detachMedia();
  } catch {
    /*
     * Media မ attach ရသေးရင် detachMedia error ကို
     * လျစ်လျူရှုနိုင်ပါတယ်။
     */
  }

  try {
    oldHLS.destroy();
  } catch (error) {
    console.warn("HLS cleanup error:", error);
  }
}

function resetVideoElement() {
  player.pause();

  player.removeAttribute("src");

  /*
   * HTML ထဲမှာ source element ထည့်ခဲ့ဖူးရင်ပါ
   * ဖယ်ရှားပေးပါမယ်။
   */
  player
    .querySelectorAll("source")
    .forEach(source => source.remove());

  /*
   * Browser decoder/network request အဟောင်းတွေကို
   * ရပ်စေဖို့ load() ပြန်ခေါ်ပါတယ်။
   */
  player.load();
}

function closePlayer() {
  /*
   * ဖွင့်နေတဲ့ playback callback အားလုံးကို
   * stale ဖြစ်သွားအောင် generation တိုးပါမယ်။
   */
  state.playbackGeneration++;
  state.activeVideoURL = "";

  destroyHLSPlayer();
  resetVideoElement();
  setPlayerStatus("", false);

  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }

  if (playerDialog.open) {
    playerDialog.close();
  }
}

function playVideo(url, type = "auto", name = "") {
  const videoURL = String(url || "").trim();

  if (!/^https?:\/\//i.test(videoURL)) {
    toast("Video URL မမှန်ပါ");
    return;
  }

  /*
   * ဒီ play request ရဲ့ ကိုယ်ပိုင် generation။
   * နောက် video ဖွင့်လိုက်တာနဲ့ ဒီ token က stale ဖြစ်သွားမယ်။
   */
  const playbackGeneration =
    ++state.playbackGeneration;

  destroyHLSPlayer();
  resetVideoElement();

  state.activeVideoURL = videoURL;

  const isCurrentPlayback = () =>
    playbackGeneration ===
      state.playbackGeneration &&
    state.activeVideoURL === videoURL &&
    playerDialog.open;

  playerTitle.textContent =
    String(name || "").trim() || "CMFLIX";

  setPlayerStatus(
    "Video ပြင်ဆင်နေသည်…",
    true
  );

  if (!playerDialog.open) {
    playerDialog.showModal();
  }

  const normalizedType =
    String(type || "auto").toLowerCase();

  const isHLS =
    normalizedType === "m3u8" ||
    (
      normalizedType === "auto" &&
      /\.m3u8(?:$|[?#])/i.test(videoURL)
    );

  let playbackStarted = false;

  const startPlayback = async () => {
    if (
      !isCurrentPlayback() ||
      playbackStarted
    ) {
      return;
    }

    playbackStarted = true;

    /*
     * once:true ကြောင့် listener က အလိုအလျောက်ပျောက်ပေမယ့်
     * state reference ကိုပါ ရှင်းထားပါတယ်။
     */
    if (
      state.nativeReadyHandler ===
      startPlayback
    ) {
      state.nativeReadyHandler = null;
    }

    setPlayerStatus("", false);

    try {
      await player.play();
    } catch (error) {
      /*
       * Video မြန်မြန်ပြောင်းဖွင့်တဲ့အခါ
       * play promise အဟောင်းက AbortError တက်နိုင်ပါတယ်။
       */
      if (
        error?.name === "AbortError" ||
        error?.name === "NotAllowedError"
      ) {
        return;
      }

      if (isCurrentPlayback()) {
        console.error(
          "Video play error:",
          error
        );

        setPlayerStatus(
          "Play ကိုနှိပ်ပြီး ပြန်ဖွင့်ကြည့်ပါ။",
          true
        );
      }
    }
  };

  const useNativeSource = () => {
    if (!isCurrentPlayback()) {
      return;
    }

    state.nativeReadyHandler =
      startPlayback;

    player.addEventListener(
      "loadedmetadata",
      startPlayback,
      { once: true }
    );

    player.src = videoURL;
    player.load();
  };

  if (isHLS) {
    /*
     * Safari/iPhone native HLS။
     */
    if (
      player.canPlayType(
        "application/vnd.apple.mpegurl"
      )
    ) {
      useNativeSource();
      return;
    }

    /*
     * Chrome, Firefox, Android စတဲ့ browser များအတွက် HLS.js။
     */
    if (window.Hls?.isSupported()) {
      const hls = new window.Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 60,
        maxBufferLength: 30
      });

      state.hls = hls;

      let networkRecoveryCount = 0;
      let mediaRecoveryCount = 0;

      const isCurrentHLS = () =>
        isCurrentPlayback() &&
        state.hls === hls;

      const destroyThisHLS = () => {
        if (state.hls === hls) {
          state.hls = null;
        }

        try {
          hls.stopLoad();
        } catch {
          /*
           * Ignore cleanup error.
           */
        }

        try {
          hls.detachMedia();
        } catch {
          /*
           * Ignore cleanup error.
           */
        }

        try {
          hls.destroy();
        } catch (error) {
          console.warn(
            "HLS destroy error:",
            error
          );
        }
      };

      hls.on(
        window.Hls.Events.MEDIA_ATTACHED,
        () => {
          if (!isCurrentHLS()) {
            return;
          }

          hls.loadSource(videoURL);
        }
      );

      hls.on(
        window.Hls.Events.MANIFEST_PARSED,
        () => {
          if (!isCurrentHLS()) {
            return;
          }

          startPlayback();
        }
      );

      hls.on(
        window.Hls.Events.ERROR,
        (_event, data) => {
          /*
           * Instance အဟောင်းက callback ဖြစ်ရင်
           * ဘာမှမလုပ်ပါ။
           */
          if (!isCurrentHLS()) {
            return;
          }

          if (!data?.fatal) {
            return;
          }

          if (
            data.type ===
            window.Hls.ErrorTypes.NETWORK_ERROR
          ) {
            networkRecoveryCount++;

            if (networkRecoveryCount <= 2) {
              setPlayerStatus(
                "Network ပြန်လည်ချိတ်ဆက်နေသည်…",
                true
              );

              const retryDelay =
                networkRecoveryCount * 700;

              setTimeout(() => {
                if (isCurrentHLS()) {
                  hls.startLoad();
                }
              }, retryDelay);

              return;
            }

            setPlayerStatus(
              "Video server နှင့် ချိတ်ဆက်၍မရပါ။ Link သို့မဟုတ် CORS ကိုစစ်ပါ။",
              true
            );

            destroyThisHLS();
            return;
          }

          if (
            data.type ===
            window.Hls.ErrorTypes.MEDIA_ERROR
          ) {
            mediaRecoveryCount++;

            if (mediaRecoveryCount <= 2) {
              setPlayerStatus(
                "Video ပြန်လည်ပြင်ဆင်နေသည်…",
                true
              );

              setTimeout(() => {
                if (isCurrentHLS()) {
                  hls.recoverMediaError();
                }
              }, mediaRecoveryCount * 300);

              return;
            }

            setPlayerStatus(
              "Video format ကို browser က ဖတ်၍မရပါ။",
              true
            );

            destroyThisHLS();
            return;
          }

          setPlayerStatus(
            "Video ဖွင့်၍မရပါ။ Link နှင့် video server ကိုစစ်ပါ။",
            true
          );

          destroyThisHLS();
        }
      );

      /*
       * attachMedia ကို အရင်လုပ်ပြီး MEDIA_ATTACHED
       * ဖြစ်မှ loadSource လုပ်ပါမယ်။
       */
      hls.attachMedia(player);
      return;
    }

    setPlayerStatus(
      "ဤ browser သည် HLS video ကို မထောက်ပံ့ပါ။",
      true
    );

    return;
  }

  /*
   * MP4 သို့မဟုတ် browser က တိုက်ရိုက်ဖွင့်နိုင်တဲ့ video။
   */
  useNativeSource();
}




function cleanEpisodeURL(value) {
  const cleaned = String(value || "")
    .trim()
    .replace(/^[("'[{<]+/g, "")
    .replace(/[)"'\]}>;]+$/g, "");

  try {
    const parsed = new URL(cleaned);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "";
    }

    return parsed.href;
  } catch {
    return "";
  }
}

function positiveInteger(value, fallback = 1) {
  const number = Number.parseInt(value, 10);

  return Number.isFinite(number) && number > 0
    ? number
    : fallback;
}

function parseEpisodes(
  text,
  existingEpisodes = []
) {
  const input = String(text || "").trim();

  if (!input) {
    return [];
  }

  /*
   * JSON input ဖြစ်ပြီး episode number ပါပြီးသားဆိုရင်
   * မူရင်းနံပါတ်အတိုင်း normalize လုပ်ပါမယ်။
   */
  try {
    const json = JSON.parse(input);

    const rows = Array.isArray(json)
      ? json
      : json?.episodes;

    if (Array.isArray(rows)) {
      return normalizeParsedEpisodes(rows);
    }
  } catch {
    /*
     * JSON မဟုတ်ရင် line parser ဆက်သုံးမယ်။
     */
  }

  const lines = input
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const episodes = [];

  /*
   * Season တစ်ခုချင်းစီရဲ့ ရှိပြီးသား
   * အမြင့်ဆုံး episode number နောက်က ဆက်စပါမယ်။
   */
  const nextEpisodeBySeason = new Map();

  for (const existing of existingEpisodes || []) {
    const season = positiveInteger(
      existing.season_number,
      1
    );

    const episode = positiveInteger(
      existing.episode_number,
      1
    );

    const currentNext =
      nextEpisodeBySeason.get(season) || 1;

    nextEpisodeBySeason.set(
      season,
      Math.max(currentNext, episode + 1)
    );
  }

  for (const line of lines) {
    const rawURLs =
      line.match(/\bhttps?:\/\/[^\s<>"']+/gi) || [];

    const urls = rawURLs
      .map(cleanEpisodeURL)
      .filter(Boolean);

    if (!urls.length) {
      continue;
    }

    let readableLine = line;

    try {
      readableLine =
        decodeURIComponent(line);
    } catch {
      /*
       * Malformed URI ဖြစ်ရင် မူရင်းကိုသုံးမယ်။
       */
    }

    const seasonMatch = readableLine.match(
      /(?:season|s)[\s._-]*0*(\d{1,3})(?!\d)/i
    );

    const episodeMatch = readableLine.match(
      /(?:episode|ep|e)[\s._-]*0*(\d{1,4})(?!\d)/i
    );

    const season = positiveInteger(
      seasonMatch?.[1],
      1
    );

    /*
     * E3 လို explicit number ပါရင် E3 ကိုသုံးမယ်။
     * URL သက်သက်ဆိုရင် ရှိပြီးသားအမြင့်ဆုံးနောက်က ဆက်မယ်။
     */
    let episode = episodeMatch
      ? positiveInteger(
          episodeMatch[1],
          1
        )
      : positiveInteger(
          nextEpisodeBySeason.get(season),
          1
        );

    for (const url of urls) {
      episodes.push({
        season_number: season,
        episode_number: episode,
        episode_title:
          `Episode ${episode}`,
        video_url: url,
        video_type:
          /\.m3u8(?:$|[?#])/i.test(url)
            ? "m3u8"
            : "auto"
      });

      episode++;
    }

    const currentNext =
      nextEpisodeBySeason.get(season) || 1;

    nextEpisodeBySeason.set(
      season,
      Math.max(currentNext, episode)
    );
  }

  return normalizeParsedEpisodes(episodes);
}

function normalizeParsedEpisodes(rows) {
  const unique = new Map();

  for (const row of rows || []) {
    const season = positiveInteger(
      row.season_number ?? row.season,
      1
    );

    const episode = positiveInteger(
      row.episode_number ??
      row.episode ??
      row.ep,
      1
    );

    const url = cleanEpisodeURL(
      row.video_url ??
      row.url ??
      row.link
    );

    if (!url) {
      continue;
    }

    const requestedType = String(
      row.video_type || ""
    ).toLowerCase();

    const videoType = ["auto", "mp4", "m3u8"]
      .includes(requestedType)
      ? requestedType
      : /\.m3u8(?:$|[?#])/i.test(url)
        ? "m3u8"
        : "auto";

    unique.set(`${season}:${episode}`, {
      season_number: season,
      episode_number: episode,
      episode_title: String(
        row.episode_title ??
        row.title ??
        `Episode ${episode}`
      ).trim(),
      video_url: url,
      video_type: videoType
    });
  }

  return [...unique.values()].sort(
    (a, b) =>
      a.season_number - b.season_number ||
      a.episode_number - b.episode_number
  );
}

async function renderAdmin() {
  if (state.user?.role !== "admin") {
    openAuth();
    return;
  }

  app.innerHTML = `
    <section class="admin-card">
      <div class="section-header">
        <h1>CMFLIX Admin</h1>
        <div>
          <button id="maintenanceButton" class="button secondary">
            Maintenance
          </button>
          <button id="publishAllButton" class="button secondary">
            Publish all drafts
          </button>
          <button id="newTitleButton" class="button">
            + Add title
          </button>
        </div>
      </div>

      <div class="admin-toolbar">
        <input
          id="adminSearch"
          class="search-input"
          placeholder="ဇာတ်ကားရှာရန်…"
        >

        <select id="adminStatus" class="search-input">
          <option value="all">All status</option>
          <option value="public">Public</option>
          <option value="draft">Draft</option>
        </select>

        <select id="adminCategory" class="search-input">
          <option value="all">All category</option>
          <option value="movies">Movies</option>
          <option value="series">Series</option>
          <option value="lugyi">Lugyi</option>
        </select>
      </div>

      <div id="adminList" class="admin-list"></div>
    </section>
  `;

  document.querySelector("#newTitleButton")
    .addEventListener("click", () => renderTitleEditor());

  document.querySelector("#maintenanceButton")
    .addEventListener("click", renderMaintenanceEditor);

  document.querySelector("#publishAllButton")
    .addEventListener("click", publishAllDrafts);

  for (const id of ["adminSearch", "adminStatus", "adminCategory"]) {
    document.querySelector(`#${id}`)
      .addEventListener("input", debounce(loadAdminTitles, 250));
  }

  loadAdminTitles();
}

async function publishAllDrafts() {
  const accepted = confirm(
    "Draft ကားအားလုံးကို Public ပြောင်းမှာ သေချာပါသလား?"
  );

  if (!accepted) {
    return;
  }

  try {
    const result = await api("admin/titles/publish-all", {
      method: "POST"
    });

    toast(`${result.published} ကား Public လုပ်ပြီးပါပြီ`);
    loadAdminTitles();
  } catch (error) {
    toast(error.message);
  }
}

async function loadAdminTitles() {
  const q = document.querySelector("#adminSearch")?.value || "";
  const status = document.querySelector("#adminStatus")?.value || "all";
  const category = document.querySelector("#adminCategory")?.value || "all";

  const data = await api(
    `admin/titles?q=${encodeURIComponent(q)}` +
    `&status=${encodeURIComponent(status)}` +
    `&category=${encodeURIComponent(category)}`
  );

  const list = document.querySelector("#adminList");
  if (!list) return;

  list.innerHTML = data.items.map(item => `
    <article class="admin-row">
      <img src="${escapeHTML(item.poster_url)}" alt="">

      <div>
        <strong>${escapeHTML(item.title)}</strong>
        <div class="muted">
          ${escapeHTML(item.category)}
          ·
          <span class="status-${escapeHTML(item.status)}">
            ${escapeHTML(item.status)}
          </span>
        </div>
      </div>

      <div class="admin-row-actions">
        <button
          class="button secondary small"
          data-admin-edit="${escapeHTML(item.id)}"
        >
          Edit
        </button>

        <button
          class="button danger small"
          data-admin-delete="${escapeHTML(item.id)}"
        >
          Delete
        </button>
      </div>
    </article>
  `).join("");
}

async function renderTitleEditor(id = null) {
  let item = {
    title: "",
    slug: "",
    category: "movies",
    status: "draft",
    video_type: "auto",
    featured: 0,
    episodes: []
  };

  if (id) {
    item = (await api(`admin/titles/${encodeURIComponent(id)}`)).item;
  }

  state.editing = id;
  state.parsedEpisodes = item.episodes || [];

  app.innerHTML = `
    <section class="admin-card">
      <div class="section-header">
        <h1>${id ? "Edit title" : "Add title"}</h1>
        <button id="backAdmin" class="button secondary">Back</button>
      </div>

      <div class="field full">
        <span>TMDB Search</span>
        <div class="admin-toolbar">
          <input
            id="tmdbSearch"
            class="search-input"
            placeholder="TMDB မှ ရှာရန်…"
          >
          <button id="tmdbButton" class="button secondary">
            Search
          </button>
        </div>
        <div id="tmdbResults" class="admin-list"></div>
      </div>

      <form id="titleForm" class="form-grid">
        <input name="tmdb_id" type="hidden" value="${escapeHTML(item.tmdb_id || "")}">
        <input name="tmdb_type" type="hidden" value="${escapeHTML(item.tmdb_type || "")}">

        ${field("title", "Title", item.title, true)}
        ${field("slug", "Slug", item.slug)}
        ${field("original_title", "Original title", item.original_title)}
        ${field("release_date", "Release date", item.release_date)}
        ${field("year", "Year", item.year, false, "number")}
        <label class="field">
  <span>Rating</span>
  <input
    name="rating"
    type="number"
    inputmode="decimal"
    min="0"
    max="10"
    step="0.1"
    value="${escapeHTML(item.rating ?? 0)}"
  >
</label>
        ${field(
  "poster_url",
  "Poster URL or proxy path",
  item.poster_url,
  false,
  "text"
)}

${field(
  "backdrop_url",
  "Backdrop URL or proxy path",
  item.backdrop_url,
  false,
  "text"
)}

        ${field("genres", "Genres", item.genres)}

        <label class="field">
          <span>Category</span>
          <select name="category">
            ${option("movies", item.category)}
            ${option("series", item.category)}
            ${option("lugyi", item.category)}
          </select>
        </label>

        <label class="field">
          <span>Status</span>
          <select name="status">
            ${option("draft", item.status)}
            ${option("public", item.status)}
          </select>
        </label>

        <label class="field">
          <span>Video type</span>
          <select name="video_type">
            ${option("auto", item.video_type)}
            ${option("mp4", item.video_type)}
            ${option("m3u8", item.video_type)}
          </select>
        </label>

        <label class="field">
          <span>Featured</span>
          <select name="featured">
            <option value="0" ${!item.featured ? "selected" : ""}>No</option>
            <option value="1" ${item.featured ? "selected" : ""}>Yes</option>
          </select>
        </label>

        ${field("video_url", "Movie/Main video URL", item.video_url, false, "url")}

        <label class="field full">
          <span>Overview</span>
          <textarea name="overview">${escapeHTML(item.overview || "")}</textarea>
        </label>

        <label class="field full">
          <span>
            Episode bulk input — JSON, SQL-like text,
            “S1 E1 URL”, “Episode 1 URL” အားလုံးထည့်နိုင်သည်
          </span>
          <textarea
            id="episodeBulk"
            placeholder="S1 E1 https://example.com/e1.m3u8&#10;S1 E2 https://example.com/e2.mp4"
          ></textarea>
        </label>

        <div class="full">
          <button id="parseButton" type="button" class="button secondary">
            Auto parse episodes
          </button>
        </div>

        <div id="episodePreview" class="parser-preview full"></div>

        <div class="form-actions full">
          <button class="button" type="submit">Save</button>
          <button id="cancelEdit" class="button secondary" type="button">
            Cancel
          </button>
        </div>
      </form>
    </section>
  `;

  renderEpisodePreview();

  document.querySelector("#backAdmin")
    .addEventListener("click", renderAdmin);

  document.querySelector("#cancelEdit")
    .addEventListener("click", renderAdmin);

  document.querySelector("#parseButton")
    .addEventListener("click", () => {
      const bulkInput =
        document.querySelector("#episodeBulk");

      const newEpisodes = parseEpisodes(
        bulkInput.value,
        state.parsedEpisodes
      );

      if (!newEpisodes.length) {
        toast("ဖတ်လို့ရတဲ့ episode link မတွေ့ပါ");
        return;
      }

      /*
       * Existing episodes ကို အရင်ထည့်ပြီး
       * အသစ်တွေကို နောက်မှထည့်ထားပါတယ်။
       *
       * Season/Episode တူရင် အသစ်က အဟောင်းကို update လုပ်မယ်။
       * မတူရင် episode အသစ်အဖြစ် ထပ်ပေါင်းမယ်။
       */
      state.parsedEpisodes =
        normalizeParsedEpisodes([
          ...state.parsedEpisodes,
          ...newEpisodes
        ]);

      /*
       * Parse ပြီးသား input ကို ရှင်းထားပါမယ်။
       * ထပ်နှိပ်မိပြီး duplicate ဖြစ်တာ လျော့စေပါတယ်။
       */
      bulkInput.value = "";

      renderEpisodePreview();

      toast(
        `${newEpisodes.length} episodes ထပ်ပေါင်းပြီးပါပြီ`
      );
    });

  document.querySelector("#tmdbButton")
    .addEventListener("click", searchTMDB);

  document.querySelector("#titleForm")
    .addEventListener("submit", saveTitle);
}

function field(name, label, value = "", required = false, type = "text") {
  return `
    <label class="field">
      <span>${escapeHTML(label)}</span>
      <input
        name="${escapeHTML(name)}"
        type="${escapeHTML(type)}"
        value="${escapeHTML(value ?? "")}"
        ${required ? "required" : ""}
      >
    </label>
  `;
}

function option(value, current) {
  return `
    <option
      value="${escapeHTML(value)}"
      ${value === current ? "selected" : ""}
    >
      ${escapeHTML(value)}
    </option>
  `;
}

function renderEpisodePreview() {
  const preview =
    document.querySelector("#episodePreview");

  if (!preview) {
    return;
  }

  if (!state.parsedEpisodes.length) {
    preview.innerHTML = `
      <div class="parser-empty">
        Episode မရှိသေးပါ
      </div>
    `;

    return;
  }

  preview.innerHTML = `
    <div class="parser-preview-header">
      <strong>
        Episodes (${state.parsedEpisodes.length})
      </strong>

      <button
        type="button"
        class="button danger small"
        data-clear-episodes
      >
        အားလုံးဖျက်မည်
      </button>
    </div>

    <div class="parser-list">
      ${state.parsedEpisodes.map((episode, index) => `
        <div
          class="parser-row editable"
          data-episode-index="${index}"
        >
          <label>
            <span>Season</span>
            <input
              type="number"
              min="1"
              step="1"
              value="${escapeHTML(
                episode.season_number
              )}"
              data-episode-field="season_number"
            >
          </label>

          <label>
            <span>Episode</span>
            <input
              type="number"
              min="1"
              step="1"
              value="${escapeHTML(
                episode.episode_number
              )}"
              data-episode-field="episode_number"
            >
          </label>

          <label class="parser-url-field">
            <span>Video URL</span>
            <input
              type="url"
              value="${escapeHTML(
                episode.video_url
              )}"
              data-episode-field="video_url"
            >
          </label>

          <label>
            <span>Type</span>
            <select data-episode-field="video_type">
              <option
                value="auto"
                ${
                  episode.video_type === "auto"
                    ? "selected"
                    : ""
                }
              >
                auto
              </option>

              <option
                value="m3u8"
                ${
                  episode.video_type === "m3u8"
                    ? "selected"
                    : ""
                }
              >
                m3u8
              </option>

              <option
                value="mp4"
                ${
                  episode.video_type === "mp4"
                    ? "selected"
                    : ""
                }
              >
                mp4
              </option>
            </select>
          </label>

          <button
            type="button"
            class="button danger small parser-delete"
            data-remove-episode="${index}"
          >
            ဖျက်မည်
          </button>
        </div>
      `).join("")}
    </div>
  `;

  preview
    .querySelectorAll("[data-episode-field]")
    .forEach(input => {
      input.addEventListener("input", event => {
        const row = event.target.closest(
          "[data-episode-index]"
        );

        const index = Number(
          row?.dataset.episodeIndex
        );

        const field =
          event.target.dataset.episodeField;

        const episode =
          state.parsedEpisodes[index];

        if (!episode || !field) {
          return;
        }

        if (
          field === "season_number" ||
          field === "episode_number"
        ) {
          episode[field] = positiveInteger(
            event.target.value,
            1
          );
        } else {
          episode[field] = event.target.value;
        }
      });
    });

  preview
    .querySelectorAll("[data-remove-episode]")
    .forEach(button => {
      button.addEventListener("click", () => {
        const index = Number(
          button.dataset.removeEpisode
        );

        state.parsedEpisodes.splice(index, 1);
        renderEpisodePreview();
      });
    });

  preview
    .querySelector("[data-clear-episodes]")
    ?.addEventListener("click", () => {
      const accepted = confirm(
        "Episode အားလုံးဖျက်မှာ သေချာပါသလား?"
      );

      if (!accepted) {
        return;
      }

      state.parsedEpisodes = [];
      renderEpisodePreview();
    });
}

async function searchTMDB() {
  const query = document.querySelector("#tmdbSearch").value.trim();
  if (query.length < 2) return;

  try {
    const data = await api(
      `admin/tmdb/search?q=${encodeURIComponent(query)}`
    );

    document.querySelector("#tmdbResults").innerHTML =
      data.results.map((item, index) => `
        <button
          class="admin-row"
          data-tmdb-index="${index}"
          type="button"
        >
          <img src="${escapeHTML(item.poster_url)}" alt="">
          <span>
            <strong>${escapeHTML(item.title)}</strong>
            <br>
            <span class="muted">
              ${escapeHTML(item.year || "")}
              · ${escapeHTML(item.tmdb_type)}
            </span>
          </span>
        </button>
      `).join("");

    document.querySelectorAll("[data-tmdb-index]").forEach(button => {
      button.addEventListener("click", () => {
        const item = data.results[Number(button.dataset.tmdbIndex)];
        fillTMDB(item);
      });
    });
  } catch (error) {
    toast(error.message);
  }
}

function fillTMDB(item) {
  const form = document.querySelector("#titleForm");

  for (const [key, value] of Object.entries(item)) {
    if (form.elements[key]) {
      form.elements[key].value = value ?? "";
    }
  }

  document.querySelector("#tmdbResults").innerHTML = "";
  toast("TMDB data ဖြည့်ပြီးပါပြီ");
}

async function saveTitle(event) {
  event.preventDefault();

  const form = new FormData(event.currentTarget);
  const body = Object.fromEntries(form.entries());

  body.tmdb_id = body.tmdb_id
  ? Number(body.tmdb_id)
  : null;

body.year = body.year
  ? Number(body.year)
  : null;

body.rating = Number(body.rating || 0);
body.featured = body.featured === "1";
body.episodes = state.parsedEpisodes;

body.title = String(body.title || "").trim();
body.slug = String(body.slug || "").trim();
body.original_title = String(
  body.original_title || ""
).trim();

body.overview = String(
  body.overview || ""
).trim();

body.poster_url = String(
  body.poster_url || ""
).trim();

body.backdrop_url = String(
  body.backdrop_url || ""
).trim();

body.video_url = String(
  body.video_url || ""
).trim();

body.genres = String(
  body.genres || ""
).trim();


  try {
    await api(
      state.editing
        ? `admin/titles/${encodeURIComponent(state.editing)}`
        : "admin/titles",
      {
        method: state.editing ? "PUT" : "POST",
        body: JSON.stringify(body)
      }
    );

    toast("သိမ်းပြီးပါပြီ");
    renderAdmin();
  } catch (error) {
    toast(error.message);
  }
}

async function renderMaintenanceEditor() {
  const data = await api("admin/settings");

  app.innerHTML = `
    <section class="admin-card">
      <div class="section-header">
        <h1>Maintenance Mode</h1>
        <button id="backAdmin" class="button secondary">Back</button>
      </div>

      <form id="maintenanceForm" class="form-stack">
        <label class="field">
          <span>Mode</span>
          <select name="maintenance">
            <option value="0" ${!data.maintenance ? "selected" : ""}>
              Website ဖွင့်ထားမည်
            </option>
            <option value="1" ${data.maintenance ? "selected" : ""}>
              Maintenance ဖွင့်မည်
            </option>
          </select>
        </label>

        <label class="field">
          <span>Message</span>
          <textarea name="maintenanceMessage">${escapeHTML(
            data.maintenanceMessage
          )}</textarea>
        </label>

        <button class="button">Save</button>
      </form>
    </section>
  `;

  document.querySelector("#backAdmin")
    .addEventListener("click", renderAdmin);

  document.querySelector("#maintenanceForm")
    .addEventListener("submit", async event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);

      await api("admin/settings", {
        method: "PUT",
        body: JSON.stringify({
          maintenance: form.get("maintenance") === "1",
          maintenanceMessage: form.get("maintenanceMessage")
        })
      });

      toast("Maintenance setting သိမ်းပြီးပါပြီ");
      renderAdmin();
    });
}

function renderMaintenance(message) {
  app.innerHTML = `
    <section class="maintenance-card">
      <h1>CMFLIX Maintenance</h1>
      <p>${escapeHTML(message)}</p>
      <button class="button" id="maintenanceLogin">
        Admin Login
      </button>
    </section>
  `;

  document.querySelector("#maintenanceLogin")
    .addEventListener("click", () => openAuth());
}

function debounce(callback, delay) {
  let timer;

  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), delay);
  };
}
function isProtectedMedia(target) {
  return target instanceof Element &&
    Boolean(
      target.closest(
        ".poster-wrap, " +
        ".detail-poster, " +
        ".cast-card img, " +
        ".hero, " +
        ".detail-hero"
      )
    );
}

document.addEventListener("contextmenu", event => {
  if (isProtectedMedia(event.target)) {
    event.preventDefault();
  }
});

document.addEventListener("dragstart", event => {
  if (isProtectedMedia(event.target)) {
    event.preventDefault();
  }
});

/* -------------------- Global events -------------------- */

window.addEventListener("hashchange", route);

document.addEventListener("click", async event => {
  const category =
    event.target.closest("[data-category]");

  const page =
    event.target.closest("[data-page]");

  const openTitle =
    event.target.closest("[data-open-title]");

  const play =
    event.target.closest("[data-play-url]");

  const favorite =
    event.target.closest("[data-favorite]");

  const removeFavoriteButton =
    event.target.closest(
      "[data-remove-favorite]"
    );

  const edit =
    event.target.closest("[data-admin-edit]");

  const remove =
    event.target.closest("[data-admin-delete]");

  /*
   * Favorite remove ကို အရင်စစ်ပါမယ်။
   * Remove နှိပ်ချိန် detail page မဝင်အောင်
   * ဒီ block ပြီးရင် return လုပ်ထားပါတယ်။
   */
  if (removeFavoriteButton) {
    event.preventDefault();
    event.stopPropagation();

    const titleId =
      removeFavoriteButton.dataset
        .removeFavorite;

    const accepted = confirm(
      "ဒီဇာတ်ကားကို Favorite မှ ဖယ်ရှားမှာ သေချာပါသလား?"
    );

    if (!accepted) {
      return;
    }

    removeFavoriteButton.disabled = true;

    try {
      await api(
        `favorites/${encodeURIComponent(titleId)}`,
        {
          method: "DELETE"
        }
      );

      const entry =
        removeFavoriteButton.closest(
          "[data-favorite-entry]"
        );

      entry?.remove();

      const remaining =
        document.querySelectorAll(
          "[data-favorite-entry]"
        );

      if (!remaining.length) {
        const grid =
          document.querySelector(
            ".movie-grid"
          );

        if (grid) {
          grid.innerHTML = `
            <section class="empty-card full">
              Favorite မရှိသေးပါ
            </section>
          `;
        }
      }

      toast(
        "Favorite မှ ဖယ်ရှားပြီးပါပြီ"
      );
    } catch (error) {
      removeFavoriteButton.disabled = false;
      toast(error.message);
    }

    return;
  }

  if (category) {
    location.hash =
      `#/${category.dataset.category}`;
  }

  if (page) {
    location.hash =
      page.dataset.page === "favorites"
        ? "#/favorites"
        : `#/${state.category}`;
  }

  if (openTitle) {
    location.hash =
      `#/watch/${encodeURIComponent(
        openTitle.dataset.openTitle
      )}`;
  }

  if (play) {
    playVideo(
      play.dataset.playUrl,
      play.dataset.playType,
      play.dataset.playName
    );
  }

  if (favorite) {
    if (favorite.disabled) {
      return;
    }

    favorite.disabled = true;

    try {
      await api(
        `favorites/${encodeURIComponent(
          favorite.dataset.favorite
        )}`,
        {
          method: "POST"
        }
      );

      toast("Favorite ထည့်ပြီးပါပြီ");

      favorite.innerHTML = `
        ${icons.heart}
        Favorite ထည့်ပြီး
      `;
    } catch (error) {
      favorite.disabled = false;
      toast(error.message);
    }
  }

  if (edit) {
    renderTitleEditor(
      edit.dataset.adminEdit
    );
  }

  if (remove) {
    const accepted = confirm(
      "ဒီဇာတ်ကားကို ဖျက်မှာသေချာပါသလား?"
    );

    if (!accepted) {
      return;
    }

    try {
      await api(
        `admin/titles/${encodeURIComponent(
          remove.dataset.adminDelete
        )}`,
        {
          method: "DELETE"
        }
      );

      toast("ဖျက်ပြီးပါပြီ");
      loadAdminTitles();
    } catch (error) {
      toast(error.message);
    }
  }
});

accountButton.addEventListener("click", () => openAuth());

document.querySelector("[data-close-dialog]")
  .addEventListener("click", () => authDialog.close());

document.querySelector("[data-close-player]")
  .addEventListener("click", closePlayer);

playerDialog.addEventListener("cancel", event => {
  event.preventDefault();
  closePlayer();
});

playerFullscreen.addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    if (typeof player.requestFullscreen === "function") {
      await player.requestFullscreen({
        navigationUI: "hide"
      });

      return;
    }

    if (
      typeof player.webkitEnterFullscreen ===
      "function"
    ) {
      player.webkitEnterFullscreen();
    }
  } catch {
    toast("Fullscreen ဖွင့်၍မရပါ");
  }
});

player.addEventListener("waiting", () => {
  if (
    playerDialog.open &&
    state.activeVideoURL
  ) {
    setPlayerStatus("Buffering…", true);
  }
});

player.addEventListener("playing", () => {
  if (
    playerDialog.open &&
    state.activeVideoURL
  ) {
    setPlayerStatus("", false);
  }
});

player.addEventListener("canplay", () => {
  if (
    playerDialog.open &&
    state.activeVideoURL
  ) {
    setPlayerStatus("", false);
  }
});

player.addEventListener("error", () => {
  if (
    !playerDialog.open ||
    !state.activeVideoURL
  ) {
    return;
  }

  setPlayerStatus(
    "Video ဖွင့်၍မရပါ။ URL၊ CORS သို့မဟုတ် video server ကိုစစ်ပါ။",
    true
  );
});

authContent.addEventListener("click", async event => {
  if (event.target.closest("#goAdmin")) {
    authDialog.close();
    location.hash = "#/admin";
  }

  if (event.target.closest("#logoutButton")) {
    try {
      await api("auth/logout", { method: "POST" });
      state.user = null;
      state.csrf = "";
      authDialog.close();
      toast("Logout လုပ်ပြီးပါပြီ");
      location.hash = "#/movies";
      route();
    } catch (error) {
      toast(error.message);
    }
  }
});

initialize();
