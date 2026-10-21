(() => {
  // Language: saved choice, else the browser's language (Dutch → nl, everything else → en).
  const titles = { nl: 'Filmavond downloaden', en: 'Download MovieNight' };
  const setLang = (l, save) => {
    document.documentElement.lang = l;
    document.documentElement.dataset.lang = l;
    document.title = titles[l];
    document.querySelectorAll('[data-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.set === l)));
    if (save) try { localStorage.setItem('mn-lang', l); } catch {}
  };
  let saved = null;
  try { saved = localStorage.getItem('mn-lang'); } catch {}
  const browser = (navigator.languages || [navigator.language || '']).some((x) => /^nl\b/i.test(x)) ? 'nl' : 'en';
  setLang(saved === 'nl' || saved === 'en' ? saved : browser, false);
  document.querySelectorAll('[data-set]').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.set, true)));

  const slides = [...document.querySelectorAll('.shot')];
  const imgOf = (slide, lang) => slide.querySelector(`img[lang="${lang}"]`);
  // Phones show only the strip of small screenshots; there a tap opens the viewer.
  const stripMode = () => matchMedia('(max-width: 699px)').matches;

  // Desktop: the small screenshots pick the large one and the text beside it.
  const feature = document.getElementById('feature');
  const story = document.getElementById('story');
  let current = 0;
  const select = (i) => {
    if (i === current) return;
    current = i;
    slides.forEach((s, j) => s.setAttribute('aria-current', String(j === i)));
    feature.classList.add('fading');
    setTimeout(() => {
      ['nl', 'en'].forEach((l) => {
        const src = imgOf(slides[i], l);
        const dst = feature.querySelector(`img[lang="${l}"]`);
        dst.src = src.src;
        dst.alt = src.alt;
      });
      story.innerHTML = slides[i].querySelector('.cap').innerHTML;
      feature.classList.remove('fading');
    }, 150);
  };

  // Viewer: the screenshot in the current language, with its text; swipe, arrows or Esc.
  const lb = document.getElementById('lb');
  const lbImg = document.getElementById('lb-img');
  const lbCap = document.getElementById('lb-cap');
  const lbPrev = document.getElementById('lb-prev');
  const lbNext = document.getElementById('lb-next');
  let open = -1;
  const show = (i) => {
    open = Math.max(0, Math.min(slides.length - 1, i));
    const lang = document.documentElement.dataset.lang;
    const img = imgOf(slides[open], lang);
    lbImg.src = img.src;
    lbImg.alt = img.alt;
    lbCap.textContent = slides[open].querySelector(`.cap p [lang="${lang}"]`)?.textContent ?? '';
    lbPrev.disabled = open === 0;
    lbNext.disabled = open === slides.length - 1;
    lb.hidden = false;
    document.body.style.overflow = 'hidden';
  };
  const close = () => { lb.hidden = true; open = -1; document.body.style.overflow = ''; };

  slides.forEach((s, i) => s.addEventListener('click', () => (stripMode() ? show(i) : select(i))));
  feature.addEventListener('click', () => show(current));
  lbPrev.addEventListener('click', (e) => { e.stopPropagation(); show(open - 1); });
  lbNext.addEventListener('click', (e) => { e.stopPropagation(); show(open + 1); });
  document.getElementById('lb-close').addEventListener('click', close);
  lb.addEventListener('click', (e) => { if (e.target === lb) close(); });
  document.addEventListener('keydown', (e) => {
    if (lb.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') show(open - 1);
    else if (e.key === 'ArrowRight') show(open + 1);
  });
  let x0 = null;
  lb.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 40) show(open + (dx < 0 ? 1 : -1));
  });
})();
