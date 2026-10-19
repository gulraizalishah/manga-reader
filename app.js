
const API = "/.netlify/functions/mangadex";

const state = {
  mode: "popular",
  offset: 0,
  limit: 24,
  loading: false,
  hasMore: true,
  query: "",
  saved: loadSaved(),
  currentManga: null,
  chapterOffset: 0,
  chapterLimit: 100,
  chapterLoading: false
};

const $ = (selector) => document.querySelector(selector);
const grid = $("#manga-grid");
const statusBox = $("#status");
const loadMore = $("#load-more");

function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem("panel-saved") || "[]");
  } catch {
    return [];
  }
}

function saveSaved() {
  localStorage.setItem("panel-saved", JSON.stringify(state.saved));
}

function esc(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

// Arrays become repeated MangaDex query parameters such as includes[]=cover_art.
function makeParams(values) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(`${key}[]`, item);
      }
    } else if (value !== undefined && value !== null) {
      params.append(key, String(value));
    }
  }

  return params;
}

function titleOf(manga) {
  const titles = manga?.attributes?.title || {};
  return titles.en ||
    titles["ja-ro"] ||
    titles.ja ||
    Object.values(titles)[0] ||
    "Untitled manga";
}

function descriptionOf(manga) {
  const descriptions = manga?.attributes?.description || {};
  return descriptions.en ||
    Object.values(descriptions)[0] ||
    "No description has been provided.";
}

function coverUrl(manga, size = "256") {
  const cover = manga?.relationships?.find(
    (relation) => relation.type === "cover_art"
  );

  if (!cover?.attributes?.fileName) return "";

  return `https://uploads.mangadex.org/covers/${manga.id}/${cover.attributes.fileName}.${size}.jpg`;
}

function yearOf(manga) {
  return manga?.attributes?.year ||
    manga?.attributes?.originalLanguage?.toUpperCase() ||
    "MANGA";
}

function statusText(manga) {
  return (manga?.attributes?.status || "unknown").replace(/-/g, " ");
}

async function api(path) {
  // Every API request goes through the Netlify function.
  const response = await fetch(API + path, {
    headers: { Accept: "application/json" }
  });

  const text = await response.text();
  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text || "Invalid response from server" };
  }

  if (!response.ok) {
    throw new Error(
      data?.errors?.[0]?.detail ||
      data?.detail ||
      data?.error ||
      `Request failed (${response.status})`
    );
  }

  return data;
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(
    () => toast.classList.remove("show"),
    2100
  );
}

function setStatus(message, error = false) {
  statusBox.innerHTML = error
    ? `<div class="error-box">${esc(message)}<button id="retry-button">Try again</button></div>`
    : `<span class="spinner"></span> ${esc(message)}`;

  statusBox.classList.remove("hidden");

  $("#retry-button")?.addEventListener("click", () => {
    loadManga(true);
  });
}

function clearStatus() {
  statusBox.classList.add("hidden");
  statusBox.innerHTML = "";
}

function mangaCard(manga) {
  const id = manga.id;
  const title = titleOf(manga);
  const cover = coverUrl(manga);
  const saved = state.saved.some((item) => item.id === id);

  return `
    <article class="manga-card"
      data-manga="${esc(id)}"
      tabindex="0"
      role="button"
      aria-label="Open ${esc(title)}">

      <div class="cover-wrap">
        ${
          cover
            ? `<img loading="lazy"
                src="${esc(cover)}"
                alt="Cover of ${esc(title)}"
                onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">
               <div class="cover-placeholder" style="display:none">P.</div>`
            : `<div class="cover-placeholder">P.</div>`
        }

        <div class="cover-shade"></div>

        <button class="save-mini ${saved ? "saved" : ""}"
          data-save="${esc(id)}"
          aria-label="${saved ? "Remove from" : "Save"} shelf"
          title="${saved ? "Remove from saved" : "Save manga"}">
          ${saved ? "♥" : "♡"}
        </button>
      </div>

      <div class="card-meta">
        <div class="card-title">${esc(title)}</div>
        <div class="card-sub">
          ${esc(yearOf(manga))} · ${esc(statusText(manga))}
        </div>
      </div>
    </article>
  `;
}

function bindGrid(container) {
  container.querySelectorAll("[data-manga]").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest("[data-save]")) return;
      openManga(card.dataset.manga);
    });

    card.addEventListener("keydown", (event) => {
      if (
        event.key === "Enter" &&
        !event.target.closest("[data-save]")
      ) {
        openManga(card.dataset.manga);
      }
    });
  });

  container.querySelectorAll("[data-save]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleSaved(button.dataset.save);
    });
  });
}

async function loadManga(reset = false) {
  if (state.loading) return;

  if (reset) {
    state.offset = 0;
    state.hasMore = true;
    grid.innerHTML = "";
    loadMore.classList.add("hidden");
  }

  if (!state.hasMore) return;

  state.loading = true;
  loadMore.disabled = true;

  setStatus(
    state.query
      ? "Searching MangaDex…"
      : state.mode === "popular"
        ? "Loading popular manga…"
        : "Loading latest updates…"
  );

  try {
    let params;

    if (state.query) {
      params = makeParams({
        limit: state.limit,
        offset: state.offset,
        includes: ["cover_art"],
        "order[relevance]": "desc",
        contentRating: ["safe", "suggestive", "erotica"]
      });

      params.set("title", state.query);
    } else if (state.mode === "popular") {
      params = makeParams({
        limit: state.limit,
        offset: state.offset,
        includes: ["cover_art"],
        "order[followedCount]": "desc",
        contentRating: ["safe", "suggestive"]
      });
    } else {
      params = makeParams({
        limit: state.limit,
        offset: state.offset,
        includes: ["cover_art"],
        "order[latestUploadedChapter]": "desc",
        hasAvailableChapters: "true",
        contentRating: ["safe", "suggestive"]
      });
    }

    const data = await api("/manga?" + params.toString());
    const results = data.data || [];

    if (state.offset === 0 && results.length === 0) {
      setStatus("No manga found. Try another search.", true);
      return;
    }

    clearStatus();

    grid.insertAdjacentHTML(
      "beforeend",
      results.map(mangaCard).join("")
    );

    bindGrid(grid);

    state.offset += results.length;
    state.hasMore = results.length === state.limit;

    loadMore.classList.toggle("hidden", !state.hasMore);
  } catch (error) {
    setStatus(
      `Couldn't load manga. ${error.message}`,
      true
    );
  } finally {
    state.loading = false;
    loadMore.disabled = false;
  }
}

function toggleSaved(id) {
  const existing = state.saved.find((item) => item.id === id);

  if (existing) {
    state.saved = state.saved.filter((item) => item.id !== id);
    showToast("Removed from your shelf");
  } else {
    const card =
      document.querySelector(`#manga-grid [data-manga="${id}"]`) ||
      document.querySelector(`#saved-grid [data-manga="${id}"]`);

    const title =
      card?.querySelector(".card-title")?.textContent ||
      (state.currentManga?.id === id
        ? titleOf(state.currentManga)
        : "Saved manga");

    const cover =
      card?.querySelector("img")?.src ||
      (state.currentManga?.id === id
        ? coverUrl(state.currentManga)
        : "");

    state.saved.push({ id, title, cover });
    showToast("Added to your shelf");
  }

  saveSaved();
  refreshSaveButtons();

  if (!$("#saved-section").classList.contains("hidden")) {
    renderSaved();
  }
}

function refreshSaveButtons() {
  document.querySelectorAll("[data-save]").forEach((button) => {
    const saved = state.saved.some(
      (item) => item.id === button.dataset.save
    );

    button.classList.toggle("saved", saved);
    button.textContent = saved ? "♥" : "♡";
    button.title = saved ? "Remove from saved" : "Save manga";
  });
}

function renderSaved() {
  const savedGrid = $("#saved-grid");

  if (!state.saved.length) {
    savedGrid.innerHTML = "";
    $("#empty-saved").classList.remove("hidden");
    return;
  }

  $("#empty-saved").classList.add("hidden");

  savedGrid.innerHTML = state.saved.map((item) => `
    <article class="manga-card"
      data-manga="${esc(item.id)}"
      role="button"
      tabindex="0">

      <div class="cover-wrap">
        ${
          item.cover
            ? `<img loading="lazy"
                src="${esc(item.cover)}"
                alt="Cover"
                onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">
               <div class="cover-placeholder" style="display:none">P.</div>`
            : `<div class="cover-placeholder">P.</div>`
        }

        <div class="cover-shade"></div>
        <button class="save-mini saved"
          data-save="${esc(item.id)}"
          aria-label="Remove from shelf">♥</button>
      </div>

      <div class="card-meta">
        <div class="card-title">${esc(item.title)}</div>
        <div class="card-sub">SAVED TO YOUR SHELF</div>
      </div>
    </article>
  `).join("");

  bindGrid(savedGrid);
}

function showSaved() {
  $("#discover-section").classList.add("hidden");
  $("#saved-section").classList.remove("hidden");
  renderSaved();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showDiscover() {
  $("#saved-section").classList.add("hidden");
  $("#discover-section").classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function openManga(id) {
  const root = $("#modal-root");

  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="detail-modal">
        <button class="close-button" aria-label="Close">×</button>

        <div class="detail-top">
          <div class="detail-cover"></div>
          <div class="detail-copy">
            <p class="eyebrow">MANGA DETAILS</p>
            <h2>Loading…</h2>
            <p>Fetching series details from MangaDex.</p>
          </div>
        </div>

        <div class="chapter-area">
          <div class="chapter-heading">
            <h3>Chapters</h3>
            <span>Loading…</span>
          </div>
          <div class="chapter-list"></div>
        </div>
      </div>
    </div>
  `;

  const close = () => {
    root.innerHTML = "";
  };

  root.querySelector(".close-button").onclick = close;

  root.querySelector(".modal-backdrop").addEventListener("click", (event) => {
    if (event.target.classList.contains("modal-backdrop")) close();
  });

  try {
    const data = await api(
      `/manga/${encodeURIComponent(id)}?includes[]=cover_art&includes[]=author&includes[]=artist`
    );

    const manga = data.data;
    state.currentManga = manga;

    const title = titleOf(manga);
    const cover = coverUrl(manga);
    const attributes = manga.attributes || {};

    const tags = (attributes.tags || [])
      .slice(0, 7)
      .map((tag) => tag.attributes?.name?.en)
      .filter(Boolean);

    const creators = (manga.relationships || [])
      .filter((relation) =>
        ["author", "artist"].includes(relation.type)
      )
      .map((relation) => relation.attributes?.name)
      .filter(Boolean);

    const coverElement = root.querySelector(".detail-cover");

    if (cover) {
      coverElement.outerHTML = `
        <img class="detail-cover"
          src="${esc(cover)}"
          alt="Cover of ${esc(title)}">
      `;
    } else {
      coverElement.outerHTML = `
        <div class="detail-cover cover-placeholder">P.</div>
      `;
    }

    root.querySelector(".detail-copy").innerHTML = `
      <p class="eyebrow">MANGA DETAILS</p>
      <h2>${esc(title)}</h2>

      <div class="pills">
        <span class="pill">${esc(statusText(manga))}</span>
        <span class="pill">${esc(yearOf(manga))}</span>
        ${
          attributes.contentRating
            ? `<span class="pill">${esc(attributes.contentRating)}</span>`
            : ""
        }
      </div>

      <p>${esc(descriptionOf(manga))}</p>

      <div class="pills">
        ${tags.map((tag) => `<span class="pill">${esc(tag)}</span>`).join("")}
      </div>

      ${
        creators.length
          ? `<p>By ${esc([...new Set(creators)].join(", "))}</p>`
          : ""
      }

      <div class="detail-actions">
        <button class="primary-button" id="save-detail">
          ${state.saved.some((item) => item.id === id)
            ? "♥ Saved to shelf"
            : "♡ Save to shelf"}
        </button>
      </div>
    `;

    root.querySelector("#save-detail").onclick = () => {
      toggleSaved(id);
      root.querySelector("#save-detail").textContent =
        state.saved.some((item) => item.id === id)
          ? "♥ Saved to shelf"
          : "♡ Save to shelf";
    };

    await loadChapters(id, 0, true);
  } catch (error) {
    root.querySelector(".detail-copy").innerHTML = `
      <h2>Couldn't load series</h2>
      <p>${esc(error.message)}</p>
    `;
  }
}

async function loadChapters(id, offset = 0, initial = false) {
  const root = $("#modal-root");
  const list = root.querySelector(".chapter-list");

  if (!list) return;

  const heading = root.querySelector(".chapter-heading span");

  if (initial) {
    list.innerHTML = `<p class="card-sub">Loading available chapters…</p>`;
    state.chapterOffset = 0;
  } else {
    root.querySelector("#more-chapters")?.remove();
  }

  state.chapterLoading = true;

  try {
    const params = makeParams({
      manga: id,
      limit: state.chapterLimit,
      offset,
      translatedLanguage: ["en"],
      "order[volume]": "asc",
      "order[chapter]": "asc",
      includes: ["scanlation_group"]
    });

    const data = await api("/chapter?" + params.toString());
    const chapters = data.data || [];

    heading.textContent = `${data.total ?? chapters.length} listed`;

    if (initial) list.innerHTML = "";

    if (chapters.length === 0 && initial) {
      list.innerHTML = `
        <p class="card-sub">
          No English-translated chapters were found for this series.
        </p>
      `;
      return;
    }

    list.insertAdjacentHTML(
      "beforeend",
      chapters.map((chapter) => {
        const attributes = chapter.attributes || {};

        const chapterName = attributes.chapter
          ? `Chapter ${attributes.chapter}`
          : "Oneshot / unnumbered";

        const extra = [
          attributes.title,
          attributes.translatedLanguage?.toUpperCase(),
          attributes.pages ? `${attributes.pages} pages` : ""
        ].filter(Boolean).join(" · ");

        return `
          <button class="chapter-row"
            data-chapter="${esc(chapter.id)}"
            data-label="${esc(titleOf(state.currentManga))} — ${esc(chapterName)}">

            <span>
              <strong>${esc(chapterName)}</strong>
              <small>${esc(extra || "Tap to read")}</small>
            </span>

            <span class="read-arrow">↗</span>
          </button>
        `;
      }).join("")
    );

    list.querySelectorAll("[data-chapter]").forEach((button) => {
      button.addEventListener("click", () => {
        openReader(button.dataset.chapter, button.dataset.label);
      });
    });

    state.chapterOffset = offset + chapters.length;

    if (state.chapterOffset < (data.total || 0)) {
      const more = document.createElement("button");

      more.id = "more-chapters";
      more.className = "secondary-button";
      more.textContent = "Load more chapters";
      more.onclick = () => loadChapters(id, state.chapterOffset, false);

      list.after(more);
    }
  } catch (error) {
    list.innerHTML = `
      <div class="error-box">
        Couldn't load chapters. ${esc(error.message)}
        <button id="retry-chapters">Try again</button>
      </div>
    `;

    list.querySelector("#retry-chapters").onclick = () => {
      loadChapters(id, 0, true);
    };
  } finally {
    state.chapterLoading = false;
  }
}

async function openReader(chapterId, label) {
  const reader = $("#reader-root");

  reader.classList.remove("hidden");
  document.body.style.overflow = "hidden";

  reader.innerHTML = `
    <div class="reader-bar">
      <button id="reader-back">← Back</button>
      <div class="reader-label">${esc(label)}</div>
      <button id="reader-close">✕</button>
    </div>
    <div class="reader-message">
      <span class="spinner"></span>
      <p>Loading chapter pages…</p>
    </div>
  `;

  const close = () => {
    reader.classList.add("hidden");
    reader.innerHTML = "";
    document.body.style.overflow = "";
  };

  reader.querySelector("#reader-back").onclick = close;
  reader.querySelector("#reader-close").onclick = close;

  try {
    const data = await api(
      `/at-home/server/${encodeURIComponent(chapterId)}`
    );

    const chapter = data.chapter;
    const base = data.baseUrl;

    if (!base || !chapter?.hash) {
      throw new Error("MangaDex returned incomplete chapter data.");
    }

    // Prefer data-saver pages initially when available.
    let quality = chapter.dataSaver?.length ? "data-saver" : "data";

    function getPages() {
      return quality === "data-saver" && chapter.dataSaver?.length
        ? chapter.dataSaver
        : chapter.data;
    }

    function pageUrl(filename) {
      return `${base}/${quality}/${encodeURIComponent(chapter.hash)}/${encodeURIComponent(filename)}`;
    }

    function renderPages() {
      const pages = getPages();

      if (!pages?.length) {
        throw new Error("No page images were returned for this chapter.");
      }

      const pageContainer = reader.querySelector(".reader-pages");

      pageContainer.innerHTML = pages.map((filename, index) => `
        <img
          loading="${index < 2 ? "eager" : "lazy"}"
          src="${esc(pageUrl(filename))}"
          alt="Page ${index + 1}"
          onerror="this.alt='Page failed to load';this.style.minHeight='120px'">
      `).join("");

      reader.querySelector(".reader-page-count").textContent =
        `${pages.length} pages`;

      reader.querySelector("#reader-quality").textContent =
        quality === "data"
          ? "Use data-saver"
          : "Use full quality";
    }

    reader.innerHTML = `
      <div class="reader-bar">
        <button id="reader-back">← Back</button>
        <div class="reader-label">${esc(label)}</div>
        <button id="reader-close">✕</button>
      </div>

      <div class="reader-controls">
        <button id="reader-quality">Change quality</button>
        <span class="card-sub reader-page-count"></span>
      </div>

      <div class="reader-pages"></div>

      <div class="reader-controls">
        <button id="reader-top">↑ Back to top</button>
        <button id="reader-close-bottom">Close reader</button>
      </div>
    `;

    reader.querySelector("#reader-back").onclick = close;
    reader.querySelector("#reader-close").onclick = close;
    reader.querySelector("#reader-close-bottom").onclick = close;

    reader.querySelector("#reader-top").onclick = () => {
      reader.scrollTo({ top: 0, behavior: "smooth" });
    };

    reader.querySelector("#reader-quality").onclick = () => {
      quality = quality === "data" ? "data-saver" : "data";

      if (quality === "data-saver" && !chapter.dataSaver?.length) {
        quality = "data";
        showToast("Data-saver images are unavailable for this chapter.");
        return;
      }

      renderPages();
    };

    renderPages();
  } catch (error) {
    reader.querySelector(".reader-message").innerHTML = `
      <div class="error-box">
        Couldn't load this chapter. ${esc(error.message)}
        <button id="reader-retry">Try again</button>
      </div>
    `;

    reader.querySelector("#reader-retry").onclick = () => {
      openReader(chapterId, label);
    };
  }
}

// Search
$("#search-form").addEventListener("submit", (event) => {
  event.preventDefault();

  state.query = $("#search-input").value.trim();
  state.mode = "popular";

  $("#section-title").textContent = state.query
    ? `Results for “${state.query}”`
    : "Popular right now";

  $("#popular-tab").classList.toggle("active", !state.query);
  $("#latest-tab").classList.remove("active");

  showDiscover();
  loadManga(true);
});

// Popular manga
$("#popular-tab").onclick = () => {
  state.query = "";
  state.mode = "popular";
  $("#search-input").value = "";
  $("#section-title").textContent = "Popular right now";

  $("#popular-tab").classList.add("active");
  $("#latest-tab").classList.remove("active");

  loadManga(true);
};

// Latest updates
$("#latest-tab").onclick = () => {
  state.query = "";
  state.mode = "latest";
  $("#search-input").value = "";
  $("#section-title").textContent = "Latest updates";

  $("#latest-tab").classList.add("active");
  $("#popular-tab").classList.remove("active");

  loadManga(true);
};

loadMore.onclick = () => loadManga(false);

$("#saved-toggle").onclick = showSaved;
$("#back-discover").onclick = showDiscover;

$("#home-link").onclick = (event) => {
  event.preventDefault();
  state.query = "";
  showDiscover();
  $("#popular-tab").click();
};

$("#explore-button").onclick = () => {
  $("#discover-section").scrollIntoView({ behavior: "smooth" });
};

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    const reader = $("#reader-root");

    if (!reader.classList.contains("hidden")) {
      reader.classList.add("hidden");
      reader.innerHTML = "";
      document.body.style.overflow = "";
    } else {
      $("#modal-root").innerHTML = "";
    }
  }
});

// Start the app.
loadManga(true);
