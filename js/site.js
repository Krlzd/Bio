(() => {
  const body = document.body;
  const themeButton = document.querySelector(".theme-toggle");
  const menuButton = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".site-nav");
  const toast = document.querySelector("#toast");
  let toastTimeout;

  const showToast = (message) => {
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(toastTimeout);
    toastTimeout = window.setTimeout(() => toast.classList.remove("is-visible"), 2400);
  };

  const setTheme = (isNight) => {
    body.classList.toggle("night-mode", isNight);
    document.documentElement.classList.toggle("night-mode", isNight);
    themeButton.innerHTML = `<span aria-hidden="true">${isNight ? "☀" : "☾"}</span>`;
    themeButton.setAttribute("aria-label", `Switch to ${isNight ? "day" : "night"} mode`);
    themeButton.setAttribute("aria-pressed", String(isNight));
    document.querySelector('meta[name="theme-color"]').content = isNight ? "#171c1e" : "#f2f0e8";
  };

  const persistTheme = (isNight) => {
    setTheme(isNight);
    try {
      window.localStorage.setItem("sae-site-theme", isNight ? "night" : "day");
    } catch (error) {
      showToast("Theme changed for this visit only.");
    }
  };

  setTheme(document.documentElement.classList.contains("night-mode"));

  themeButton.addEventListener("click", () => persistTheme(!document.documentElement.classList.contains("night-mode")));

  const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
  colorScheme.addEventListener("change", (event) => {
    try {
      if (window.localStorage.getItem("sae-site-theme") === null) setTheme(event.matches);
    } catch {
      setTheme(event.matches);
    }
  });

  menuButton.addEventListener("click", () => {
    const isOpen = menuButton.getAttribute("aria-expanded") === "true";
    menuButton.setAttribute("aria-expanded", String(!isOpen));
    nav.classList.toggle("is-open", !isOpen);
  });
  nav.addEventListener("click", (event) => {
    if (event.target.closest("a")) {
      menuButton.setAttribute("aria-expanded", "false");
      nav.classList.remove("is-open");
    }
  });

  document.querySelectorAll("[data-copy-quote]").forEach((button) => {
    button.addEventListener("click", async () => {
      const quote = "He doesn't look for an opening. He decides where it will be.";
      try {
        await navigator.clipboard.writeText(quote);
        showToast("Quote copied to your clipboard.");
      } catch {
        showToast(quote);
      }
    });
  });

  const form = document.querySelector("#guestbook-form");
  const messageField = document.querySelector("#guest-message");
  const count = document.querySelector("#character-count");
  const notesList = document.querySelector("#guest-notes");
  const status = document.querySelector("#form-status");
  const storageKey = "sae-site-guestbook";

  messageField.addEventListener("input", () => {
    count.textContent = `${messageField.value.length} / 240`;
  });

  const readNotes = () => {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
      return Array.isArray(parsed) ? parsed.filter((note) =>
        note && typeof note.name === "string" && typeof note.message === "string"
      ).slice(0, 6) : [];
    } catch {
      status.textContent = "Guestbook storage is unavailable in this browser.";
      return [];
    }
  };

  const renderNotes = () => {
    notesList.replaceChildren();
    for (const note of readNotes()) {
      const article = document.createElement("article");
      article.className = "guest-note";
      const name = document.createElement("strong");
      name.textContent = note.name || "A fellow observer";
      const message = document.createElement("p");
      message.textContent = note.message;
      article.append(name, message);
      notesList.append(article);
    }
  };
  renderNotes();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const message = messageField.value.trim();
    if (!message) {
      status.textContent = "Please write a note before pinning it.";
      return;
    }
    const name = form.elements.name.value.trim();
    const notes = readNotes();
    notes.unshift({ name: name.slice(0, 32), message: message.slice(0, 240) });
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(notes.slice(0, 6)));
      form.reset();
      count.textContent = "0 / 240";
      status.textContent = "Your note is pinned in this browser.";
      renderNotes();
    } catch {
      status.textContent = "Couldn't save this note. Check your browser's storage settings.";
    }
  });

  const canScrambleText =
    window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  document.querySelectorAll("[data-scramble-text]").forEach((element) => {
    const text = element.textContent;
    const accessibleText = document.createElement("span");
    const visualText = document.createElement("span");
    const characters = [];

    accessibleText.className = "sr-only";
    accessibleText.textContent = text;
    visualText.setAttribute("aria-hidden", "true");

    for (const character of text) {
      const span = document.createElement("span");
      span.className = "char";
      span.textContent = character === " " ? "\u00a0" : character;
      characters.push({ element: span, original: span.textContent });
      visualText.append(span);
    }
    element.replaceChildren(accessibleText, visualText);

    if (!canScrambleText) return;

    const radius = 100;
    const activeCharacters = new Map();
    let animationFrame = 0;

    const restoreCharacters = () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      for (const [character, state] of activeCharacters) {
        character.textContent = state.original;
      }
      activeCharacters.clear();
    };

    const animate = (time) => {
      for (const [character, state] of activeCharacters) {
        const progress = (time - state.startedAt) / state.duration;
        if (progress >= 1) {
          character.textContent = state.original;
          activeCharacters.delete(character);
        } else if (time - state.lastUpdate >= 45) {
          character.textContent = ".:"[Math.floor(Math.random() * 2)];
          state.lastUpdate = time;
        }
      }

      if (activeCharacters.size) {
        animationFrame = window.requestAnimationFrame(animate);
      } else {
        animationFrame = 0;
      }
    };

    element.addEventListener("pointermove", (event) => {
      for (const character of characters) {
        if (character.original === "\u00a0") continue;
        const rect = character.element.getBoundingClientRect();
        const distance = Math.hypot(
          event.clientX - (rect.left + rect.width / 2),
          event.clientY - (rect.top + rect.height / 2)
        );
        if (distance >= radius || activeCharacters.has(character.element)) continue;

        const duration = 1200 * (1 - distance / radius);
        activeCharacters.set(character.element, {
          original: character.original,
          startedAt: performance.now(),
          lastUpdate: 0,
          duration: Math.max(120, duration)
        });
      }
      if (!animationFrame && activeCharacters.size) {
        animationFrame = window.requestAnimationFrame(animate);
      }
    });
    element.addEventListener("pointerleave", restoreCharacters);
  });
})();
