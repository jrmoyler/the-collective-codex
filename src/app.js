import { CATALOG, FAMILY_OPTIONS, SHEETS } from "./data/catalog.js";
import { DIVISIONS } from "./data/divisions.js";
import { createMatchState, endTurn, playCard } from "./lib/game.js";

const app = document.querySelector("#app");
const state = {
  view: "overview",
  divisionFilter: "all",
  familyFilter: "all",
  query: "",
  selectedCardId: null,
  match: createMatchState()
};

const STARTER_HAND = [
  CATALOG.find((card) => card.divisionId === 1 && card.family === "Operative"),
  CATALOG.find((card) => card.divisionId === 2 && card.family === "Spell"),
  CATALOG.find((card) => card.divisionId === 11 && card.family === "Defense"),
  CATALOG.find((card) => card.divisionId === 21 && card.family === "Android"),
  CATALOG.find((card) => card.divisionId === 19 && card.family === "Monster")
].filter(Boolean);

state.selectedCardId = STARTER_HAND[0]?.id ?? CATALOG[0].id;

function selectedCard() {
  return CATALOG.find((card) => card.id === state.selectedCardId) ?? null;
}

function filteredCards() {
  const normalized = state.query.trim().toLowerCase();
  return CATALOG.filter((card) => {
    const divisionMatch = state.divisionFilter === "all" || card.divisionId === Number(state.divisionFilter);
    const familyMatch = state.familyFilter === "all" || card.family === state.familyFilter;
    const queryMatch = !normalized
      || card.canonicalName.toLowerCase().includes(normalized)
      || card.division.name.toLowerCase().includes(normalized)
      || card.family.toLowerCase().includes(normalized);
    return divisionMatch && familyMatch && queryMatch;
  });
}

function iconMarkup(division, size = "md") {
  return `<span class="division-icon division-icon--${size}" style="color:${division.primary}" role="img" aria-label="${division.name} icon">${division.icon}</span>`;
}

function cardMarkup(card, { compact = false } = {}) {
  const selected = state.selectedCardId === card.id;
  const totalCost = card.command + card.insight + card.essence;
  return `
    <button class="card-tile ${selected ? "is-selected" : ""} ${compact ? "is-compact" : ""}"
      style="--division:${card.division.primary};--division-soft:${card.division.secondary}"
      data-card-id="${card.id}" type="button" aria-pressed="${selected}">
      <div class="card-tile__top">
        <span class="card-tile__cost">${totalCost}</span>
        ${iconMarkup(card.division)}
      </div>
      <div class="card-tile__art" aria-hidden="true">
        <span class="card-tile__orbit"></span>
        <span class="card-tile__sigil">${card.division.icon}</span>
        <span class="card-tile__family">${card.family}</span>
      </div>
      <div class="card-tile__body">
        <strong>${card.canonicalName}</strong>
        <span>${card.setLabel}</span>
        ${compact ? "" : `<p>${card.rulesText}</p>`}
      </div>
      <div class="card-tile__footer">
        <span>${card.rarity}</span>
        <span>PWR ${card.power}</span>
      </div>
    </button>
  `;
}

function shell(content) {
  return `
    <div class="app-shell">
      <header class="topbar">
        <button class="brand" type="button" data-view="overview">
          <span class="brand__mark">✦</span>
          <span>
            <strong>THE COLLECTIVE CODEX</strong>
            <small>TWENTY-ONE DIVISIONS · INFINITE OUTCOMES</small>
          </span>
        </button>
        <nav aria-label="Primary navigation">
          ${["overview", "codex", "battlefield"].map((item) => `
            <button type="button" data-view="${item}" class="${state.view === item ? "is-active" : ""}">${item}</button>
          `).join("")}
        </nav>
        <div class="topbar__status"><span class="status-light"></span><span>REGISTRY ONLINE</span></div>
      </header>
      ${content}
      <footer class="footer">
        <span>COLLECTIVE AI INC · ARCHITECTING A HUMANE FUTURE</span>
        <span>BUILD 0.1 · VERCEL TARGET</span>
      </footer>
    </div>
  `;
}

function overviewMarkup() {
  const icons = DIVISIONS.slice(1).map((division, index) => {
    const angle = (index / 20) * Math.PI * 2;
    const radius = index % 2 === 0 ? 42 : 31;
    const x = 50 + Math.cos(angle) * radius;
    const y = 50 + Math.sin(angle) * radius;
    return `<span style="left:${x}%;top:${y}%;color:${division.primary}" title="${division.name}">${division.icon}</span>`;
  }).join("");

  const divisionCards = DIVISIONS.map((division) => `
    <button class="division-card" type="button" data-division="${division.id}" style="--division:${division.primary}">
      <div class="division-card__top">
        <span>${String(division.id).padStart(2, "0")}</span>
        ${iconMarkup(division, "lg")}
      </div>
      <strong>${division.name}</strong>
      <p>${division.doctrine}</p>
      <div>${division.keywords.map((keyword) => `<span>${keyword}</span>`).join("")}</div>
    </button>
  `).join("");

  return `
    <main class="overview">
      <section class="hero">
        <div class="hero__copy">
          <span class="hero__eyeline">LIVING DIGITAL CARD GAME</span>
          <h1>Every card changes the battlefield.</h1>
          <p>Build across twenty-one doctrines, command animated units, rewrite laws, channel rituals and confront a hidden intelligence that learns how you play.</p>
          <div class="hero__actions">
            <button class="primary-button" type="button" data-view="battlefield">Enter battlefield</button>
            <button class="secondary-button" type="button" data-view="codex">Open the Codex</button>
          </div>
        </div>
        <div class="hero__visual" aria-label="Division constellation">
          <div class="constellation"><div class="constellation__core">✦</div>${icons}</div>
        </div>
      </section>
      <section class="metrics" aria-label="Project metrics">
        <article><strong>21</strong><span>Playable divisions</span></article>
        <article><strong>54</strong><span>Developed sheets</span></article>
        <article><strong>1,134</strong><span>Registry entries</span></article>
        <article><strong>28</strong><span>Card families</span></article>
      </section>
      <section class="division-grid">
        <div class="section-heading">
          <div><span>LOCKED DIVISIONAL ICON SYSTEM</span><h2>The twenty-one doctrines</h2></div>
          <button type="button" class="secondary-button" data-view="codex">Browse every card</button>
        </div>
        <div class="division-grid__items">${divisionCards}</div>
      </section>
    </main>
  `;
}

function codexMarkup() {
  const cards = filteredCards();
  const rail = `
    <aside class="division-rail" aria-label="Division filters">
      <button class="division-filter ${state.divisionFilter === "all" ? "is-active" : ""}" type="button" data-division-filter="all">
        <span class="division-filter__number">∞</span><span>All divisions</span>
      </button>
      ${DIVISIONS.map((division) => `
        <button class="division-filter ${String(state.divisionFilter) === String(division.id) ? "is-active" : ""}" type="button"
          data-division-filter="${division.id}" style="--division:${division.primary}">
          ${iconMarkup(division, "sm")}
          <span class="division-filter__number">${String(division.id).padStart(2, "0")}</span>
          <span>${division.name}</span>
        </button>
      `).join("")}
    </aside>
  `;

  return `
    <main class="codex-layout">
      ${rail}
      <section class="codex-main">
        <div class="codex-toolbar">
          <div><span>CANONICAL REGISTRY</span><h1>${cards.length.toLocaleString()} entries visible</h1></div>
          <div class="codex-toolbar__controls">
            <input id="card-search" aria-label="Search cards" value="${state.query}" placeholder="Search cards, families or divisions">
            <select id="family-filter" aria-label="Filter by family">
              <option value="all">All card families</option>
              ${FAMILY_OPTIONS.map((family) => `<option value="${family}" ${state.familyFilter === family ? "selected" : ""}>${family}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="sheet-summary">
          <span>${SHEETS.length} sheets indexed</span><span>${DIVISIONS.length} locked icons</span><span>Registry schema v0.1</span>
        </div>
        <div class="card-grid">${cards.slice(0, 126).map((card) => cardMarkup(card)).join("")}</div>
        ${cards.length > 126 ? `<p class="result-note">Showing the first 126 matching entries to keep the interactive grid fast. Filters operate across all ${cards.length.toLocaleString()} matches.</p>` : ""}
      </section>
    </main>
  `;
}

function battlefieldMarkup() {
  const currentCard = selectedCard();
  const lanes = state.match.lanes.map((lane, laneIndex) => {
    const units = lane.player.map((unit) => `
      <div class="unit-token" style="--division:${unit.card.division.primary}">
        <span>${unit.card.division.icon}</span>
        <strong>${unit.card.canonicalName}</strong>
        <small>${unit.health} integrity</small>
      </div>
    `).join("");
    const sockets = Array.from({ length: 3 - lane.player.length }, () => `<span class="empty-socket">+</span>`).join("");
    return `
      <article class="lane">
        <header><span>0${laneIndex + 1}</span><strong>${lane.id}</strong>
          <button type="button" data-deploy="${laneIndex}" ${currentCard ? "" : "disabled"}>Deploy selected</button>
        </header>
        <div class="lane__opponent"><span>Rival field awaiting doctrine</span></div>
        <div class="lane__centerline"><span>${lane.id === "Conduit" ? "LAW CONDUIT" : "CONTESTED ZONE"}</span></div>
        <div class="lane__player">${units}${sockets}</div>
      </article>
    `;
  }).join("");

  return `
    <main class="battlefield-page">
      <div class="battlefield-page__heading">
        <div><span>VERTICAL SLICE · LOCAL SIMULATION</span><h1>Three-lane living battlefield</h1></div>
        <button type="button" class="secondary-button" data-reset-match>Reset match</button>
      </div>
      <section class="battlefield-shell" aria-label="Living battlefield prototype">
        <div class="battlefield-status">
          <div><span>YOUR CORE</span><strong>${state.match.coreIntegrity.player}</strong></div>
          <div class="turn-indicator"><span>TURN</span><strong>${String(state.match.turn).padStart(2, "0")}</strong></div>
          <div><span>RIVAL CORE</span><strong>${state.match.coreIntegrity.opponent}</strong></div>
        </div>
        <div class="resource-bar" aria-label="Resources">
          <span><i class="resource-dot resource-dot--command"></i> Command ${state.match.resources.command}</span>
          <span><i class="resource-dot resource-dot--insight"></i> Insight ${state.match.resources.insight}</span>
          <span><i class="resource-dot resource-dot--essence"></i> Essence ${state.match.resources.essence}</span>
        </div>
        <div class="lanes">${lanes}</div>
        <div class="hand">
          <div class="hand__title">
            <div><span>DOCTRINE HAND</span><strong>${currentCard ? currentCard.canonicalName : "Select a card"}</strong></div>
            <button type="button" class="primary-button" data-end-turn>End turn</button>
          </div>
          <div class="hand__cards">${STARTER_HAND.map((card) => cardMarkup(card, { compact: true })).join("")}</div>
        </div>
      </section>
    </main>
  `;
}

function render() {
  const content = state.view === "overview"
    ? overviewMarkup()
    : state.view === "codex"
      ? codexMarkup()
      : battlefieldMarkup();
  app.innerHTML = shell(content);
  bindEvents();
}

function bindEvents() {
  app.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      render();
    });
  });
  app.querySelectorAll("[data-division]").forEach((button) => {
    button.addEventListener("click", () => {
      state.divisionFilter = button.dataset.division;
      state.view = "codex";
      render();
    });
  });
  app.querySelectorAll("[data-division-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.divisionFilter = button.dataset.divisionFilter;
      render();
    });
  });
  app.querySelectorAll("[data-card-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedCardId = button.dataset.cardId;
      render();
    });
  });
  const search = app.querySelector("#card-search");
  if (search) {
    search.addEventListener("input", (event) => {
      state.query = event.target.value;
      render();
      const nextSearch = app.querySelector("#card-search");
      nextSearch?.focus();
      nextSearch?.setSelectionRange(state.query.length, state.query.length);
    });
  }
  const family = app.querySelector("#family-filter");
  if (family) {
    family.addEventListener("change", (event) => {
      state.familyFilter = event.target.value;
      render();
    });
  }
  app.querySelectorAll("[data-deploy]").forEach((button) => {
    button.addEventListener("click", () => {
      const card = selectedCard();
      if (!card) return;
      state.match = playCard(state.match, card, Number(button.dataset.deploy));
      render();
    });
  });
  app.querySelector("[data-end-turn]")?.addEventListener("click", () => {
    state.match = endTurn(state.match);
    render();
  });
  app.querySelector("[data-reset-match]")?.addEventListener("click", () => {
    state.match = createMatchState();
    render();
  });
}

render();
