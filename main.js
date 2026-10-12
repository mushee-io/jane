(() => {
  const body = document.body;
  const toggle = document.querySelector(".menu-toggle");
  const menu = document.getElementById("mobileMenu");
  const overlay = menu?.querySelector(".mobile-overlay");
  const menuLinks = menu ? [...menu.querySelectorAll("a")] : [];

  const setMenu = (open) => {
    if (!toggle || !menu) return;

    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    menu.hidden = !open;
    body.classList.toggle("menu-open", open);
  };

  toggle?.addEventListener("click", () => {
    setMenu(toggle.getAttribute("aria-expanded") !== "true");
  });

  overlay?.addEventListener("click", () => setMenu(false));
  menuLinks.forEach((link) => link.addEventListener("click", () => setMenu(false)));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setMenu(false);
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 720) setMenu(false);
  });

  const statValues = [...document.querySelectorAll(".stat-value")];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const renderValue = (node, value) => {
    const decimals = Number(node.dataset.decimals || 0);
    const suffix = node.dataset.suffix || "";
    node.textContent = `${Number(value).toFixed(decimals)}${suffix}`;
  };

  if (reducedMotion) {
    statValues.forEach((node) => {
      renderValue(node, Number(node.dataset.target || 0));
    });
    return;
  }

  const started = new WeakSet();
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  const animateStat = (node, index) => {
    if (started.has(node)) return;
    started.add(node);

    const target = Number(node.dataset.target || 0);
    const duration = 1500 + index * 80;
    const startOffset = 480 + index * 90;

    window.setTimeout(() => {
      const startedAt = performance.now();

      const frame = (now) => {
        const progress = Math.min(1, (now - startedAt) / duration);
        renderValue(node, target * easeOutCubic(progress));

        if (progress < 1) {
          requestAnimationFrame(frame);
        } else {
          renderValue(node, target);
        }
      };

      requestAnimationFrame(frame);
    }, startOffset);
  };

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;

          const node = entry.target;
          animateStat(node, statValues.indexOf(node));
          observer.unobserve(node);
        });
      },
      { threshold: 0.25 }
    );

    statValues.forEach((node) => observer.observe(node));
  } else {
    statValues.forEach(animateStat);
  }
})();
