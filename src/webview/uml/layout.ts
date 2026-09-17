// Automatisches Anordnen: Schichten-Layout (vereinfachtes Sugiyama). Kanten zeigen von oben nach unten
// (bzw. links nach rechts); Vererbungen werden umgedreht, damit Oberklassen oben stehen.
import type { Diagramm, Knoten } from './modell';
import { istNachricht, zeigtNachOben } from './modell';
import { amRaster, masse, SEQ_KOPF_Y } from './geometrie';

const ABSTAND_SCHICHT = 70;
const ABSTAND_NACHBAR = 40;

export function automatischAnordnen(d: Diagramm): void {
  if (d.typ === 'sequenz') {
    sequenzAnordnen(d);
    return;
  }
  const knoten = d.knoten.filter(k => k.art !== 'rahmen');
  if (knoten.length === 0) {
    return;
  }
  const zugehoerigkeit = rahmenZugehoerigkeit(d);
  const ids = new Set(knoten.map(k => k.id));
  const nachfolger = new Map<string, Set<string>>();
  const vorgaenger = new Map<string, Set<string>>();
  for (const id of ids) {
    nachfolger.set(id, new Set());
    vorgaenger.set(id, new Set());
  }
  const verbinden = (a: string, b: string) => {
    if (a === b || !ids.has(a) || !ids.has(b)) {
      return;
    }
    nachfolger.get(a)!.add(b);
    vorgaenger.get(b)!.add(a);
  };
  for (const kante of d.kanten) {
    if (zeigtNachOben(kante.art)) {
      verbinden(kante.nach, kante.von);
    } else {
      verbinden(kante.von, kante.nach);
    }
  }

  // Zyklen aufbrechen: Rückwärtskanten aus einer Tiefensuche umdrehen
  const zustand = new Map<string, 0 | 1 | 2>();
  const besuchen = (id: string) => {
    zustand.set(id, 1);
    for (const n of [...nachfolger.get(id)!]) {
      const z = zustand.get(n) ?? 0;
      if (z === 1) {
        nachfolger.get(id)!.delete(n);
        vorgaenger.get(n)!.delete(id);
        verbinden(n, id);
      } else if (z === 0) {
        besuchen(n);
      }
    }
    zustand.set(id, 2);
  };
  // Startknoten zuerst besuchen, damit sie oben landen
  const sortiert = [...knoten].sort((a, b) => vorgaenger.get(a.id)!.size - vorgaenger.get(b.id)!.size || a.y - b.y || a.x - b.x);
  for (const k of sortiert) {
    if (!zustand.get(k.id)) {
      besuchen(k.id);
    }
  }

  // Schichten: längster Pfad von den Quellen
  const schicht = new Map<string, number>();
  const tiefe = (id: string): number => {
    const bekannt = schicht.get(id);
    if (bekannt !== undefined) {
      return bekannt;
    }
    schicht.set(id, 0);
    let t = 0;
    for (const v of vorgaenger.get(id)!) {
      t = Math.max(t, tiefe(v) + 1);
    }
    schicht.set(id, t);
    return t;
  };
  for (const k of knoten) {
    tiefe(k.id);
  }
  // Knoten ohne Verbindung kommen in eine eigene letzte Schicht
  let maxSchicht = Math.max(...[...schicht.values()]);
  const einzeln = knoten.filter(k => vorgaenger.get(k.id)!.size === 0 && nachfolger.get(k.id)!.size === 0);
  if (einzeln.length && einzeln.length < knoten.length) {
    maxSchicht += 1;
    for (const k of einzeln) {
      schicht.set(k.id, maxSchicht);
    }
  }

  const horizontal = d.richtung === 'links';
  const haupt = (k: Knoten) => (horizontal ? k.y : k.x);
  const schichten: Knoten[][] = [];
  for (let i = 0; i <= maxSchicht; i++) {
    schichten.push(knoten.filter(k => schicht.get(k.id) === i).sort((a, b) => haupt(a) - haupt(b)));
  }

  // Reihenfolge innerhalb der Schichten: Schwerpunkt der Nachbarn (mehrere Durchläufe auf und ab)
  const position = new Map<string, number>();
  const positionenSetzen = () => schichten.forEach(s => s.forEach((k, i) => position.set(k.id, i)));
  positionenSetzen();
  const schwerpunkt = (k: Knoten, nachbarn: Set<string>) => {
    const werte = [...nachbarn].map(n => position.get(n)!).filter(v => v !== undefined);
    return werte.length ? werte.reduce((a, b) => a + b, 0) / werte.length : position.get(k.id)!;
  };
  for (let durchlauf = 0; durchlauf < 4; durchlauf++) {
    for (let i = 1; i < schichten.length; i++) {
      schichten[i].sort((a, b) => schwerpunkt(a, vorgaenger.get(a.id)!) - schwerpunkt(b, vorgaenger.get(b.id)!));
      positionenSetzen();
    }
    for (let i = schichten.length - 2; i >= 0; i--) {
      schichten[i].sort((a, b) => schwerpunkt(a, nachfolger.get(a.id)!) - schwerpunkt(b, nachfolger.get(b.id)!));
      positionenSetzen();
    }
  }

  // Koordinaten: Schichten untereinander (bzw. nebeneinander), jede Schicht zentriert
  const ursprung = { x: Math.min(...knoten.map(k => k.x)), y: Math.min(...knoten.map(k => k.y)) };
  const breiteVon = (k: Knoten) => (horizontal ? masse(k).h : masse(k).w);
  const tiefeVon = (k: Knoten) => (horizontal ? masse(k).w : masse(k).h);
  const gesamtBreiten = schichten.map(s => s.reduce((sum, k) => sum + breiteVon(k), 0) + (s.length - 1) * ABSTAND_NACHBAR);
  const maxBreite = Math.max(...gesamtBreiten);
  let tiefeOffset = 0;
  schichten.forEach((s, i) => {
    const schichtTiefe = Math.max(...s.map(tiefeVon));
    let lauf = (maxBreite - gesamtBreiten[i]) / 2;
    for (const k of s) {
      // innerhalb der Schicht mittig ausrichten (bei kleinen Formen wie Start/Ende wichtig)
      const mittig = (schichtTiefe - tiefeVon(k)) / 2;
      if (horizontal) {
        k.x = amRaster(ursprung.x + tiefeOffset + mittig);
        k.y = amRaster(ursprung.y + lauf);
      } else {
        k.x = amRaster(ursprung.x + lauf);
        k.y = amRaster(ursprung.y + tiefeOffset + mittig);
      }
      lauf += breiteVon(k) + ABSTAND_NACHBAR;
    }
    tiefeOffset += schichtTiefe + ABSTAND_SCHICHT;
  });

  // Rahmen um ihre bisherigen Inhalte legen
  rahmenAnpassen(d, zugehoerigkeit);
}

/** Rahmen so verschieben/vergrößern, dass ihre bisherigen Inhalte wieder innen liegen */
function rahmenAnpassen(d: Diagramm, zugehoerigkeit: Map<string, string>): void {
  for (const rahmen of d.knoten.filter(k => k.art === 'rahmen')) {
    const innen = d.knoten.filter(k => zugehoerigkeit.get(k.id) === rahmen.id);
    if (innen.length === 0) {
      continue;
    }
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const k of innen) {
      const m = masse(k);
      x1 = Math.min(x1, k.x);
      y1 = Math.min(y1, k.y);
      x2 = Math.max(x2, k.x + m.w);
      y2 = Math.max(y2, k.y + m.h);
    }
    rahmen.x = amRaster(x1 - 20);
    rahmen.y = amRaster(y1 - 40);
    rahmen.w = amRaster(x2 - x1 + 40);
    rahmen.h = amRaster(y2 - y1 + 60);
  }
}

/** Welcher Knoten liegt (mit seinem Mittelpunkt) in welchem Rahmen? */
export function rahmenZugehoerigkeit(d: Diagramm): Map<string, string> {
  const ergebnis = new Map<string, string>();
  const rahmen = d.knoten.filter(k => k.art === 'rahmen');
  for (const k of d.knoten) {
    if (k.art === 'rahmen') {
      continue;
    }
    const m = masse(k);
    const cx = k.x + m.w / 2, cy = k.y + m.h / 2;
    for (const r of rahmen) {
      const rm = masse(r);
      if (cx >= r.x && cx <= r.x + rm.w && cy >= r.y && cy <= r.y + rm.h) {
        ergebnis.set(k.id, r.id);
      }
    }
  }
  return ergebnis;
}

/** Sequenzdiagramm: Lebenslinien in ihrer Reihenfolge gleichmäßig nebeneinander, Nachrichten sind automatisch */
function sequenzAnordnen(d: Diagramm): void {
  const linien = d.knoten.filter(k => k.art === 'lebenslinie' || k.art === 'akteur').sort((a, b) => a.x - b.x);
  const y = linien.length ? Math.min(...linien.map(k => k.y)) : SEQ_KOPF_Y;
  let x = linien.length ? amRaster(Math.min(...linien.map(k => k.x))) : 40;
  const nachrichten = d.kanten.filter(k => istNachricht(k.art));
  for (let i = 0; i < linien.length; i++) {
    const k = linien[i];
    const m = masse(k);
    k.x = amRaster(x);
    k.y = amRaster(y);
    // Platz für die längste Nachrichtenbeschriftung zum rechten Nachbarn
    let mindest = 90;
    const rechts = linien[i + 1];
    if (rechts) {
      for (const n of nachrichten) {
        if ((n.von === k.id && n.nach === rechts.id) || (n.von === rechts.id && n.nach === k.id)) {
          mindest = Math.max(mindest, (n.text?.length ?? 0) * 7 + 30);
        }
      }
    }
    x += m.w + Math.max(mindest, 60);
  }
}
