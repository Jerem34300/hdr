import { useRef } from "react";
import { useScene } from "@/lib/hdar/scene";
import { useHdar } from "@/lib/hdar/store";

export function Cover() {
  const discreet = useHdar((s) => s.discreet);
  const { place } = useScene();
  const hold = useRef<number>(0);

  function down() {
    window.clearTimeout(hold.current);
    hold.current = window.setTimeout(() => useHdar.getState().setCover(false), 3000);
  }
  function up() {
    window.clearTimeout(hold.current);
  }

  if (discreet === "meteo") {
    return (
      <div
        className="fixed inset-0 z-50 bg-[#101418] px-6 pt-16 text-[#f2f2f4]"
        onPointerDown={down}
        onPointerUp={up}
        onPointerLeave={up}
      >
        <p className="text-sm text-[#9aa0a6]">{place.name === "Ici" ? "Autour de toi" : place.name}</p>
        <p className="mt-2 font-sans text-7xl font-medium tracking-tight">14°</p>
        <p className="text-lg">Nuageux</p>
        <ul className="mt-10 space-y-3 text-sm text-[#c4c7cc]">
          <li>16 h · 14°</li>
          <li>18 h · 13°</li>
          <li>20 h · 12°</li>
          <li>22 h · 11°</li>
        </ul>
      </div>
    );
  }

  const notes = [
    { t: "Courses", d: "Café, pain, citrons" },
    { t: "Dentiste", d: "Mardi 9 h 30" },
    { t: "Idées", d: "Livre pour M. · plante" },
    { t: "À faire", d: "Rapporter le chargeur" },
  ];
  return (
    <div className="fixed inset-0 z-50 bg-[#1c1c1e] px-5 pt-14 text-[#f2f2f7]" onPointerDown={down} onPointerUp={up} onPointerLeave={up}>
      <p className="text-3xl font-semibold">Notes</p>
      <ul className="mt-6 divide-y divide-[#2c2c2e]">
        {notes.map((note) => (
          <li key={note.t} className="py-4">
            <p className="text-lg">{note.t}</p>
            <p className="text-sm text-[#8e8e93]">{note.d}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
