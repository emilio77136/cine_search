const API_KEY = "3282da21e0f6a28905f7f0d03db5a110";
const BASE = "https://api.themoviedb.org/3";

const input = document.getElementById("search-input");
const list = document.getElementById("result-list");
const template = document.getElementById("result-template");
const statusBar = document.getElementById("status-bar");
const wrap = document.querySelector(".search-wrap");

const detailTitle = document.getElementById("detail-title");
const detailOverview = document.getElementById("detail-overview");
const detailRating = document.getElementById("detail-rating");
const detailCast = document.getElementById("detail-cast");

let debounceTimer;
let controller;
let activeIndex = -1;
let currentResults = [];
const cache = new Map();

/* Highlight text safely */
function highlight(title, query) {
  const span = document.createElement("span");
  const idx = title.toLowerCase().indexOf(query.toLowerCase());

  if (idx === -1) {
    span.textContent = title;
    return span;
  }

  span.append(document.createTextNode(title.slice(0, idx)));

  const mark = document.createElement("span");
  mark.className = "highlight";
  mark.textContent = title.slice(idx, idx + query.length);

  span.append(mark);
  span.append(document.createTextNode(title.slice(idx + query.length)));
  return span;
}

/* Render results using DocumentFragment */
function renderResults(results, query) {
  list.innerHTML = "";
  currentResults = results;
  activeIndex = results.length ? 0 : -1;

  const frag = document.createDocumentFragment();

  results.forEach((movie, i) => {
    const clone = template.content.cloneNode(true);
    const item = clone.querySelector(".result-item");
    const titleEl = clone.querySelector(".title");
    const meta = clone.querySelector(".meta");
    const posterEl = clone.querySelector(".poster");

    titleEl.appendChild(highlight(movie.title, query));
    meta.textContent = movie.release_date?.slice(0, 4) || "—";

    if (movie.poster_path) {
      posterEl.src = `https://image.tmdb.org/t/p/w92${movie.poster_path}`;
      posterEl.alt = movie.title;
    } else {
      posterEl.src = "";
      posterEl.alt = "No image";
    }

    item.addEventListener("click", () => selectMovie(movie));

    if (i === activeIndex) item.classList.add("active");

    frag.appendChild(clone);
  });

  list.appendChild(frag);

  document.getElementById("col-count").textContent =
    `${results.length} films found`;
}

/* Update active highlight */
function updateActive() {
  const items = document.querySelectorAll(".result-item");
  items.forEach((el, i) => el.classList.toggle("active", i === activeIndex));
}

/* Search AP I */
async function search(query) {
  if (!query) return;

  if (cache.has(query)) {
    renderResults(cache.get(query), query);
    statusBar.textContent = "CACHE";
    return;
  }

  wrap.dataset.loading = "true";

  if (controller) controller.abort();
  controller = new AbortController();

  try {
    const res = await fetch(
      `${BASE}/search/movie?api_key=${API_KEY}&query=${encodeURIComponent(query)}`,
      { signal: controller.signal }
    );

    const data = await res.json();
    cache.set(query, data.results);
    renderResults(data.results, query);

    statusBar.textContent = "NETWORK";
  } catch (e) {
    console.error(e);
  } finally {
    wrap.dataset.loading = "false";
  }
}

/* Input listener */
input.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => search(input.value.trim()), 300);
});

/* Keyboard nav */
input.addEventListener("keydown", (e) => {
  if (!currentResults.length) return;

  if (e.key === "ArrowDown") {
    activeIndex = Math.min(activeIndex + 1, currentResults.length - 1);
    updateActive();
    e.preventDefault();
  }

  if (e.key === "ArrowUp") {
    activeIndex = Math.max(activeIndex - 1, 0);
    updateActive();
    e.preventDefault();
  }

  if (e.key === "Enter" && activeIndex >= 0) {
    selectMovie(currentResults[activeIndex]);
  }
});

/* Select movie and fetch details concurrently */
async function selectMovie(movie) {
  document.getElementById("detail-empty").style.display = "none";
  document.getElementById("detail-content").classList.add("visible");

  // show loading placeholders
  detailTitle.textContent = movie.title;
  detailOverview.textContent = "Loading overview...";
  detailRating.textContent = "Loading...";
  detailCast.textContent = "Loading cast...";

  try {
    const urls = [
      fetch(`${BASE}/movie/${movie.id}?api_key=${API_KEY}`), // Details
      fetch(`${BASE}/movie/${movie.id}/credits?api_key=${API_KEY}`), // Credits
      fetch(`${BASE}/movie/${movie.id}/videos?api_key=${API_KEY}`), // Videos
    ];

    const [detailsRes, creditsRes, videosRes] = await Promise.allSettled(urls);

    // DETAILS
    if (detailsRes.status === "fulfilled") {
      const data = await detailsRes.value.json();
      detailTitle.textContent = `${data.title} (${data.release_date?.slice(0,4)||'—'})`;
      detailOverview.textContent = data.overview || "No description available.";
      detailRating.textContent = data.vote_average
        ? `${data.vote_average.toFixed(1)} / 10`
        : "N/A";
    } else {
      detailOverview.textContent = "Failed to load details.";
    }
    
    // CREDITS
    if (creditsRes.status === "fulfilled") {
      const data = await creditsRes.value.json();
      const cast = data.cast?.slice(0, 5) || [];
      detailCast.innerHTML = cast.length
        ? cast.map(actor => `<span class="cast-pill">${actor.name}</span>`).join("")
        : "No cast available";
    } else {
      detailCast.textContent = "Failed to load cast.";
    }

    // VIDEOS
    if (videosRes.status === "fulfilled") {
      const data = await videosRes.value.json();
      const trailer = data.results?.find(v => v.type==="Trailer" && v.site==="YouTube");
      if (trailer) {
        let trailerEl = document.getElementById("detail-trailer");
        if (!trailerEl) {
          trailerEl = document.createElement("a");
          trailerEl.id = "detail-trailer";
          trailerEl.target = "_blank";
          trailerEl.style.display = "block";
          trailerEl.style.marginTop = "10px";
          document.getElementById("detail-content").appendChild(trailerEl);
        }
        trailerEl.href = `https://www.youtube.com/watch?v=${trailer.key}`;
        trailerEl.textContent = "▶ Watch Trailer";
      }
    }

  } catch (err) {
    console.error(err);
    detailOverview.textContent = "Error loading movie data.";
    detailCast.textContent = "Error loading cast.";
  }
}
