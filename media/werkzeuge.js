// Beschreibt die Werkzeugleiste und die Optionen jedes Werkzeugs.
// main.js baut daraus die Oberfläche - eine neue Option ist hier nur ein Eintrag.

const strich = 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';
const svg = (inhalt) => `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">${inhalt}</svg>`;

// Farben zum Schreiben und Zeichnen
const SCHREIBFARBEN = [
  ['Rot', '#d7263d'], ['Orange', '#f46036'], ['Gelb', '#f0b429'], ['Grün', '#2e8b57'],
  ['Blau', '#1b6ca8'], ['Violett', '#6a4c93'], ['Schwarz', '#1a1a1a'], ['Weiß', '#ffffff'],
];

// Markierfarben. Dieselbe Liste bekommt auch der PDFViewer (annotationEditorHighlightColors),
// damit die Auswahl in der Leiste und die Auswahl am Editor identisch sind.
export const MARKIERFARBEN = [
  ['Gelb', '#FFFF98'], ['Grün', '#53FFBC'], ['Blau', '#80EBFF'], ['Pink', '#FFCBE6'],
];

export const WERKZEUGE = [
  {
    mode: 'NONE',
    name: 'Auswählen',
    taste: 'V',
    hinweis: 'Anmerkungen anklicken und verschieben',
    icon: svg(`<path d="M3.5 2.2 12 9.4l-3.6.5 1.9 3.8-1.6.8-1.9-3.8-2.3 2.6z" ${strich}/>`),
  },
  {
    mode: 'FREETEXT',
    name: 'Text',
    taste: 'T',
    hinweis: 'In die Seite klicken und schreiben',
    icon: svg(`<path d="M3 4.5V3h10v1.5M8 3v10M5.8 13h4.4" ${strich}/>`),
    optionen: [
      {
        art: 'zahl', param: 'FREETEXT_SIZE', name: 'Schriftgröße', einheit: 'px',
        min: 6, max: 72, schritt: 1, standard: 18,
        stufen: [['S', 12], ['M', 18], ['L', 28], ['XL', 44]],
      },
      { art: 'farbe', param: 'FREETEXT_COLOR', name: 'Textfarbe', farben: SCHREIBFARBEN, eigene: true, standard: '#d7263d' },
      { art: 'vorschau', name: 'Vorschau', groesse: 'FREETEXT_SIZE', farbe: 'FREETEXT_COLOR', text: 'Beispieltext' },
    ],
  },
  {
    mode: 'INK',
    name: 'Stift',
    taste: 'S',
    hinweis: 'Frei auf der Seite zeichnen',
    icon: svg(`<path d="M2.5 13.5l.8-2.8 7.4-7.4 2 2-7.4 7.4zM9.6 4.1l2 2" ${strich}/>`),
    optionen: [
      {
        art: 'zahl', param: 'INK_THICKNESS', name: 'Strichstärke', einheit: 'px',
        min: 1, max: 20, schritt: 1, standard: 3,
        stufen: [['Fein', 1], ['Mittel', 3], ['Dick', 8]],
      },
      { art: 'farbe', param: 'INK_COLOR', name: 'Stiftfarbe', farben: SCHREIBFARBEN, eigene: true, standard: '#d7263d' },
      // PDF.js reicht INK_OPACITY direkt als SVG-stroke-opacity durch, also 0-1.
      // Gerechnet wird in dieser Einheit, angezeigt wird Prozent.
      {
        art: 'zahl', param: 'INK_OPACITY', name: 'Deckkraft', einheit: '%',
        min: 0.1, max: 1, schritt: 0.05, standard: 1, anzeigeFaktor: 100,
        stufen: [['Zart', 0.3], ['Halb', 0.6], ['Voll', 1]],
      },
    ],
  },
  {
    mode: 'HIGHLIGHT',
    name: 'Markieren',
    taste: 'M',
    hinweis: 'Text auswählen oder frei übermalen',
    icon: svg(`<path d="M4.2 9.8 9.4 4.6l2 2-5.2 5.2H4.2zM2.5 14h11" ${strich}/>`),
    optionen: [
      { art: 'farbe', param: 'HIGHLIGHT_COLOR', name: 'Markerfarbe', farben: MARKIERFARBEN, standard: MARKIERFARBEN[0][1] },
      { art: 'schalter', param: 'HIGHLIGHT_FREE', name: 'Frei übermalen', standard: false },
      {
        art: 'zahl', param: 'HIGHLIGHT_THICKNESS', name: 'Breite', einheit: 'px',
        min: 8, max: 24, schritt: 1, standard: 12,
        // Die Breite gilt nur beim freien Übermalen; bei Textauswahl bestimmt sie der Text.
        nurWenn: { param: 'HIGHLIGHT_FREE', wert: true },
      },
    ],
  },
  {
    mode: 'STAMP',
    name: 'Bild',
    taste: 'B',
    hinweis: 'Bild auswählen und platzieren',
    icon: svg(`<rect x="2.2" y="3.2" width="11.6" height="9.6" rx="1.6" ${strich}/><circle cx="5.8" cy="6.6" r="1.1" ${strich}/><path d="m3 11.4 3.2-3 2.3 2.2 2-1.9 2.5 2.4" ${strich}/>`),
    // Der Knopf öffnet sofort den Dateidialog von VS Code - PDF.js würde erst
    // beim Klick in die Seite einen eigenen Dateidialog anbieten.
    aktion: 'bildWaehlen',
    optionen: [
      {
        art: 'aktion', knopf: 'Bild auswählen\u2026', aktion: 'bildWaehlen',
        hinweis: 'Das Bild landet auf der aktuellen Seite - dort ziehen und in der Größe ändern.',
      },
    ],
  },
];
