import FloatingWindow from "./FloatingWindow";
import { useEffect, useState } from "react";
import {
  COLOR_HEX,
  formatAge,
  getRoster,
  subscribeRoster,
} from "@/lib/gooseFamilyRoster";

type Props = {
  defaultX: number;
  defaultY: number;
  onClose: () => void;
};

const RosterWindow = ({ defaultX, defaultY, onClose }: Props) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    const unsubR = subscribeRoster(() => setTick((t) => t + 1));
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => { unsubR(); window.clearInterval(id); };
  }, []);
  const roster = getRoster();
  return (
    <FloatingWindow
      id="roster"
      title="Goose Roster"
      defaultX={defaultX}
      defaultY={defaultY}
      defaultW={280}
      onClose={onClose}
    >
      {roster.length === 0 ? (
        <p className="text-muted-foreground">No geese yet.</p>
      ) : (
        <table className="w-full text-[11px] leading-snug">
          <thead>
            <tr className="text-muted-foreground text-[10px] uppercase tracking-widest">
              <th className="text-left font-normal">Name</th>
              <th className="text-left font-normal">Sex</th>
              <th className="text-left font-normal">Color</th>
              <th className="text-left font-normal">Age</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((e) => (
              <tr key={e.id} className="border-t border-border/40">
                <td className="py-1 pr-1 font-semibold">{e.name}</td>
                <td className="py-1 pr-1">{e.sex === "f" ? "♀" : "♂"}</td>
                <td className="py-1 pr-1">
                  <span
                    style={{
                      display: "inline-block",
                      width: 10, height: 10,
                      background: COLOR_HEX[e.color],
                      border: "1px solid hsl(var(--border))",
                      marginRight: 4,
                      verticalAlign: "middle",
                    }}
                  />
                  {e.color}
                </td>
                <td className="py-1">{formatAge(e.bornAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </FloatingWindow>
  );
};

export default RosterWindow;
