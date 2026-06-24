import { useEffect, useMemo, useRef, useState } from "react";
import {
  calculateFirepower,
  validateDistribution,
  validatePlacement,
} from "@paper-fleet/game-core";
import type {
  BotDifficulty,
  Coordinate,
  FireOrder,
  PlayerSecretState,
  RevealEntry,
} from "@paper-fleet/game-core";
import { Board } from "./components/Board";
import { SetupEditor } from "./components/SetupEditor";
import { Tutorial } from "./components/Tutorial";
import { emitAck, socket } from "./socket";
import type { AckResult, GameSnapshot, Session } from "./types";

const sessionKey = "paper-fleet-session";
const errorLabels: Record<string, string> = {
  room_not_found: "ไม่พบรหัสห้องนี้",
  room_full: "ห้องเต็มแล้ว",
  orders_distribution: "ต้องกระจายกระสุนให้คู่แข่งต่างกันไม่เกินหนึ่งนัด",
  orders_ammo: "กระสุนไม่พอสำหรับคำสั่งชุดนี้",
  invalid_session: "เซสชันเดิมใช้ไม่ได้แล้ว",
};

export function App() {
  const [session, setSession] = useState<Session | null>(() => readSession());
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<Array<{ playerId?: string; text: string }>>([]);
  const [reaction, setReaction] = useState<string | null>(null);
  const [liveReveal, setLiveReveal] = useState<RevealEntry[]>([]);

  useEffect(() => {
    if (import.meta.env.MODE !== "test") socket.connect();
    const onState = (next: GameSnapshot) => setSnapshot(next);
    const onShot = (shot: RevealEntry) => setLiveReveal((current) => [...current, shot]);
    const onPhase = (event: { phase: GameSnapshot["public"]["phase"]; round: number }) =>
      setSnapshot((current) => current ? {
        ...current,
        public: { ...current.public, phase: event.phase, round: event.round },
      } : current);
    const onMessage = (message: { playerId?: string; text: string }) =>
      setMessages((current) => [...current.slice(-7), message]);
    const onReaction = (event: { reaction: string }) => {
      setReaction(event.reaction);
      window.setTimeout(() => setReaction(null), 1_500);
    };
    socket.on("room:state", onState);
    socket.on("reveal:shot", onShot);
    socket.on("phase:update", onPhase);
    socket.on("chat:message", onMessage);
    socket.on("reaction:show", onReaction);
    return () => {
      socket.off("room:state", onState);
      socket.off("reveal:shot", onShot);
      socket.off("phase:update", onPhase);
      socket.off("chat:message", onMessage);
      socket.off("reaction:show", onReaction);
    };
  }, []);

  useEffect(() => {
    if (!session || snapshot) return;
    void emitAck<AckResult>("player:reconnect", session).then((result) => {
      if (result.ok && result.snapshot) setSnapshot(result.snapshot);
      else {
        setError(labelError(result.error));
        clearSession();
        setSession(null);
      }
    });
  }, [session, snapshot]);

  useEffect(() => {
    if (snapshot?.public.phase === "PLANNING") setLiveReveal([]);
  }, [snapshot?.public.phase, snapshot?.public.round]);

  const beginSession = (result: AckResult, isHost: boolean) => {
    if (!result.ok || !result.roomCode || !result.playerId || !result.token || !result.snapshot) {
      setError(labelError(result.error));
      return;
    }
    const next = {
      roomCode: result.roomCode,
      playerId: result.playerId,
      token: result.token,
      isHost,
    };
    localStorage.setItem(sessionKey, JSON.stringify(next));
    setSession(next);
    setSnapshot(result.snapshot);
    setError("");
  };

  const leave = () => {
    clearSession();
    setSession(null);
    setSnapshot(null);
    setLiveReveal([]);
    setMessages([]);
  };

  return (
    <main className="app-shell">
      {session && snapshot ? (
        <GameApp
          session={session}
          snapshot={snapshot}
          setSnapshot={setSnapshot}
          error={error}
          setError={setError}
          messages={messages}
          reaction={reaction}
          liveReveal={liveReveal}
          onLeave={leave}
        />
      ) : (
        <Landing
          error={error}
          onTutorial={() => setTutorialOpen(true)}
          onCreated={(result) => beginSession(result, true)}
          onJoined={(result) => beginSession(result, false)}
        />
      )}
      {tutorialOpen && <Tutorial onClose={() => setTutorialOpen(false)} />}
    </main>
  );
}

function Landing({
  error,
  onTutorial,
  onCreated,
  onJoined,
}: {
  error: string;
  onTutorial: () => void;
  onCreated: (result: AckResult) => void;
  onJoined: (result: AckResult) => void;
}) {
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState(
    () => new URLSearchParams(window.location.search).get("room") ?? "",
  );

  return (
    <div className="landing">
      <header className="landing-masthead">
        <a className="wordmark" href="/">PAPER FLEET</a>
        <button className="text-button" onClick={onTutorial}>วิธีเล่น 3 นาที</button>
      </header>
      <section className="hero-sheet">
        <div className="hero-copy">
          <p className="eyebrow">เกมเรือรบฉบับวงเพื่อน · 2–6 ที่นั่ง</p>
          <h1>วาดเกาะ ซ่อนเรือ แล้วอ่านใจเพื่อน</h1>
          <p className="hero-lead">
            เขียนคำสั่งยิงพร้อมกัน เก็บกระสุนจากแผ่นดิน
            และจำให้ได้ว่าคุณเคยยิงอะไรโดน—ก่อนกองเรือจะหายไปหมด
          </p>
          <button className="button tutorial-button" onClick={onTutorial}>ลองสนามฝึก</button>
        </div>
        <div className="join-card">
          <label>
            ชื่อในห้อง
            <input
              value={name}
              maxLength={24}
              placeholder="กัปตัน..."
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <button
            className="button primary"
            onClick={() =>
              void emitAck<AckResult>("room:create", { name }).then(onCreated)
            }
          >
            สร้างห้อง
          </button>
          <div className="or-rule"><span>หรือ</span></div>
          <label>
            รหัสห้อง
            <input
              value={roomCode}
              maxLength={6}
              placeholder="ABC123"
              onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
            />
          </label>
          <button
            className="button secondary"
            onClick={() =>
              void emitAck<AckResult>("room:join", { roomCode, name }).then(onJoined)
            }
          >
            เข้าห้อง
          </button>
          {error && <p className="error-note">{error}</p>}
        </div>
      </section>
      <footer className="landing-footer">
        <span>กระดาน 8×6</span><span>เกาะ 12 ช่อง</span><span>เรือ 5 ลำ</span>
        <span>ข้อมูลจำกัด</span>
      </footer>
    </div>
  );
}

function GameApp(props: {
  session: Session;
  snapshot: GameSnapshot;
  setSnapshot: (snapshot: GameSnapshot) => void;
  error: string;
  setError: (error: string) => void;
  messages: Array<{ playerId?: string; text: string }>;
  reaction: string | null;
  liveReveal: RevealEntry[];
  onLeave: () => void;
}) {
  const { session, snapshot } = props;
  const phase = snapshot.public.phase;
  const phaseLabel = {
    LOBBY: "รวมพล",
    SETUP: "วาดแผน",
    PLANNING: "เขียนคำสั่ง",
    REVEAL: "เปิดคำสั่ง",
    SALVAGE: "เก็บกู้",
    FINISHED: "จบศึก",
  }[phase];

  return (
    <div className="game-page">
      <header className="game-header">
        <div>
          <span className="wordmark">PAPER FLEET</span>
          <strong>
            <span className="game-header-label">ห้อง</span>{" "}
            <span className="game-header-data">{session.roomCode}</span>
          </strong>
        </div>
        <div className="phase-badge">
          <span>
            <span className="game-header-label">รอบ</span>{" "}
            <span className="game-header-data">{snapshot.public.round}</span>
          </span>
          <b className="game-header-label">{phaseLabel}</b>
        </div>
        <button className="text-button" onClick={props.onLeave}>ออกจากโต๊ะ</button>
      </header>

      {phase === "LOBBY" && <LobbyScreen {...props} />}
      {phase === "SETUP" && <SetupScreen {...props} />}
      {phase === "PLANNING" && (
        snapshot.player.self.eliminated
          ? <SpectatorScreen snapshot={snapshot} />
          : <PlanningScreen {...props} />
      )}
      {(phase === "REVEAL" || phase === "SALVAGE") && <RevealScreen {...props} />}
      {phase === "FINISHED" && <ResultsScreen {...props} />}

      {props.error && <Toast message={props.error} onDismiss={() => props.setError("")} />}
      {props.reaction && <div className="reaction-pop">{props.reaction}</div>}
      {phase !== "LOBBY" && (
        <SocialBar session={session} messages={props.messages} />
      )}
    </div>
  );
}

function LobbyScreen({
  session,
  snapshot,
  setError,
}: {
  session: Session;
  snapshot: GameSnapshot;
  setError: (error: string) => void;
}) {
  const shareUrl = `${window.location.origin}?room=${session.roomCode}`;
  const addBot = (difficulty: BotDifficulty) =>
    void emitAck<AckResult>("room:update-seat", {
      roomCode: session.roomCode,
      requesterId: session.playerId,
      difficulty,
    }).then((result) => !result.ok && setError(labelError(result.error)));

  return (
    <section className="lobby-layout">
      <div className="paper-panel lobby-note">
        <p className="eyebrow">โต๊ะกำลังเปิด</p>
        <h1>รอเพื่อนวางสมุดลงบนโต๊ะ</h1>
        <p>แชร์ลิงก์นี้ให้เพื่อน หรือเติม Bot แล้วเริ่มวาดแผนได้ทันที</p>
        <div className="room-ticket">
          <strong>{session.roomCode}</strong>
          <button onClick={() => void navigator.clipboard?.writeText(shareUrl)}>คัดลอกลิงก์</button>
        </div>
        {session.isHost && (
          <div className="lobby-actions">
            <span>เติม Bot</span>
            {(["EASY", "NORMAL", "HARD"] as const).map((level) => (
              <button key={level} onClick={() => addBot(level)}>{level}</button>
            ))}
          </div>
        )}
      </div>
      <div className="seat-list">
        {snapshot.public.seats.map((seat, index) => (
          <article className="seat-card" key={seat.id}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div><strong>{seat.name}</strong><small>{seat.kind === "BOT" ? seat.botDifficulty : "ผู้เล่น"}</small></div>
            <i>{seat.connected ? "พร้อม" : "หลุด"}</i>
          </article>
        ))}
        {Array.from({ length: Math.max(0, 6 - snapshot.public.seats.length) }, (_, index) => (
          <article className="seat-card empty" key={index}>ที่นั่งว่าง</article>
        ))}
        {session.isHost && (
          <button
            className="button primary start-button"
            disabled={snapshot.public.seats.length < 2}
            onClick={() =>
              void emitAck<AckResult>("room:start", {
                roomCode: session.roomCode,
                requesterId: session.playerId,
              }).then((result) => !result.ok && setError(labelError(result.error)))
            }
          >
            เริ่มวาดแผน
          </button>
        )}
      </div>
    </section>
  );
}

export function SetupScreen({
  session,
  snapshot,
  setSnapshot,
  setError,
}: {
  session: Session;
  snapshot: GameSnapshot;
  setSnapshot: (snapshot: GameSnapshot) => void;
  setError: (error: string) => void;
}) {
  const [draft, setDraft] = useState(snapshot.player.secret);
  const validation = validatePlacement(draft);

  const randomize = () =>
    void emitAck<AckResult & { secret?: PlayerSecretState }>("setup:randomize", {
      roomCode: session.roomCode,
      playerId: session.playerId,
    }).then((result) => {
      if (!result.ok || !result.secret) return setError(labelError(result.error));
      setDraft(result.secret);
      setSnapshot({
        ...snapshot,
        player: { ...snapshot.player, secret: result.secret },
      });
    });

  const ready = async () => {
    const updated = await emitAck<AckResult>("setup:update", {
      roomCode: session.roomCode,
      playerId: session.playerId,
      secret: draft,
    });
    if (!updated.ok) return setError(labelError(updated.error));
    const result = await emitAck<AckResult>("setup:ready", {
      roomCode: session.roomCode,
      playerId: session.playerId,
    });
    if (!result.ok) setError(labelError(result.error));
  };

  return (
    <section className="setup-layout">
      <div className="section-heading">
        <div><p className="eyebrow">ลับเฉพาะกัปตัน</p><h1>วาดสนามรบของคุณ</h1></div>
        <p>เรืออยู่ในน้ำ ป้อมอยู่บนดิน ไม่มีใครเห็นหน้านี้นอกจากคุณ</p>
      </div>
      <SetupEditor value={draft} onChange={setDraft} onRandomize={randomize} />
      <button className="button primary ready-button" disabled={!validation.valid} onClick={ready}>
        ปิดสมุด · พร้อมรบ
      </button>
    </section>
  );
}

export function PlanningScreen({
  session,
  snapshot,
  setSnapshot,
  setError,
}: {
  session: Session;
  snapshot: GameSnapshot;
  setSnapshot: (snapshot: GameSnapshot) => void;
  setError: (error: string) => void;
}) {
  const opponents = snapshot.public.seats.filter(
    (seat) => seat.id !== session.playerId && !seat.eliminated,
  );
  const [targetId, setTargetId] = useState(opponents[0]?.id ?? "");
  const [orders, setOrders] = useState(snapshot.player.orders);
  const [boardMode, setBoardMode] = useState<"target" | "self">("target");
  const firepower = calculateFirepower(snapshot.player.secret);
  const fair = validateDistribution(orders.map((order) => order.targetId), opponents.map((seat) => seat.id));
  const remainingSeconds = useCountdown(snapshot.public.deadlineAt);

  useEffect(() => {
    setOrders(snapshot.player.orders);
    setTargetId(opponents[0]?.id ?? "");
    setBoardMode("target");
  }, [snapshot.public.round]);
  useEffect(() => setOrders(snapshot.player.orders), [snapshot.player.orders]);
  useEffect(() => {
    if (!opponents.some((seat) => seat.id === targetId)) setTargetId(opponents[0]?.id ?? "");
  }, [opponents, targetId]);

  const syncOrders = async (next: FireOrder[]) => {
    const result = await emitAck<AckResult & { orders?: FireOrder[] }>("orders:update", {
      roomCode: session.roomCode,
      playerId: session.playerId,
      orders: next.map(({ targetId: target, coordinate }) => ({ targetId: target, coordinate })),
    });
    if (!result.ok || !result.orders) return setError(labelError(result.error));
    setOrders(result.orders);
    setSnapshot({
      ...snapshot,
      player: { ...snapshot.player, orders: result.orders },
    });
  };

  const toggleOrder = (coordinate: Coordinate) => {
    if (!targetId || boardMode === "self") return;
    const selectedIndex = orders.findIndex(
      (order) => order.targetId === targetId && order.coordinate === coordinate,
    );
    if (selectedIndex >= 0) {
      void syncOrders(orders.filter((_, index) => index !== selectedIndex));
      return;
    }
    if (orders.length >= firepower) return;
    const next: FireOrder[] = [
      ...orders,
      {
        id: `draft-${orders.length}`,
        attackerId: session.playerId,
        targetId,
        coordinate,
      },
    ];
    void syncOrders(next);
  };

  return (
    <section className="planning-layout">
      <aside className="opponent-tabs">
        <p className="eyebrow">เลือกสมุดคู่แข่ง</p>
        {opponents.map((seat) => {
          const count = orders.filter((order) => order.targetId === seat.id).length;
          return (
            <button
              key={seat.id}
              className={targetId === seat.id ? "is-active" : ""}
              onClick={() => setTargetId(seat.id)}
            >
              <span>{seat.name}</span>
              <b>{count} นัด · {planningStatus(seat)}</b>
            </button>
          );
        })}
        <div className="planning-status-list" aria-label="สถานะผู้เล่น">
          {snapshot.public.seats.map((seat) => (
            <span key={seat.id}>{seat.name}: {planningStatus(seat)}</span>
          ))}
        </div>
      </aside>
      <div className="planning-board">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">{boardMode === "target" ? "คำสั่งลับ" : "สมุดของฉัน"}</p>
            <h1>{boardMode === "target" ? "เลือกพิกัดที่จะยิง" : "สถานะสนามรบของฉัน"}</h1>
          </div>
          <div className="timer-note"><span>เหลือ</span><strong>{remainingSeconds}s</strong></div>
        </div>
        <div className="board-view-switch" aria-label="เลือกกระดานที่จะแสดง">
          <button
            className={boardMode === "target" ? "is-active" : ""}
            onClick={() => setBoardMode("target")}
          >
            ดูเป้าหมาย
          </button>
          <button
            className={boardMode === "self" ? "is-active" : ""}
            onClick={() => setBoardMode("self")}
          >
            ดูกระดานของฉัน
          </button>
        </div>
        {boardMode === "target" ? (
          <Board
            intel={snapshot.player.intel}
            targetId={targetId}
            selected={orders.filter((order) => order.targetId === targetId).map((order) => order.coordinate)}
            onCellClick={toggleOrder}
            concealShips
          />
        ) : (
          <Board secret={snapshot.player.secret} />
        )}
        {snapshot.previousReveal.length > 0 && (
          <details className="previous-round-log">
            <summary>บันทึกรอบก่อน</summary>
            <div>
              {snapshot.previousReveal.map((shot) => (
                <span key={shot.orderId}>
                  {nameOf(snapshot, shot.attackerId)} → {nameOf(snapshot, shot.targetId)}
                  <b>{shot.coordinate}</b>
                  {resultLabel(shot.result)}
                </span>
              ))}
            </div>
          </details>
        )}
      </div>
      <aside className="order-stack">
        <div className="ammo-note"><span>กำลังยิง</span><strong>{orders.length}/{firepower}</strong></div>
        <p className={fair ? "distribution-ok" : "distribution-bad"}>
          {fair
            ? "กระจายเป้าหมายถูกต้อง"
            : "เลือกต่อได้ แต่ต้องกระจายให้ต่างกันไม่เกิน 1 นัดก่อนพร้อมโจมตี"}
        </p>
        <div className="order-cards">
          {orders.map((order, index) => (
            <button key={order.id} onClick={() => void syncOrders(orders.filter((_, itemIndex) => itemIndex !== index))}>
              <small>{String(index + 1).padStart(2, "0")} / {snapshot.public.seats.find((seat) => seat.id === order.targetId)?.name}</small>
              <strong>{order.coordinate}</strong>
              <span>แตะเพื่อลบ</span>
            </button>
          ))}
        </div>
        <button
          className="button danger seal-button"
          onClick={() =>
            void emitAck<AckResult>("orders:seal", {
              roomCode: session.roomCode,
              playerId: session.playerId,
            }).then((result) => !result.ok && setError(labelError(result.error)))
          }
        >
          พร้อมโจมตี
        </button>
      </aside>
    </section>
  );
}

export function RevealScreen({
  snapshot,
  liveReveal,
}: {
  snapshot: GameSnapshot;
  liveReveal: RevealEntry[];
}) {
  const reveal = liveReveal.length > 0 ? liveReveal : snapshot.reveal;
  const activeShot = reveal.at(-1);
  const completedByAttacker = groupReveal(
    activeShot
      ? reveal.slice(0, -1).filter((shot) => shot.attackerId !== activeShot.attackerId)
      : [],
  );
  const activeNumber = activeShot
    ? reveal.filter((shot) => shot.attackerId === activeShot.attackerId).length
    : 0;
  const activeTrail = activeShot
    ? reveal.slice(0, -1).filter((shot) => shot.attackerId === activeShot.attackerId)
    : [];
  return (
    <section className="reveal-layout">
      <div className="paper-panel reveal-title">
        <p className="eyebrow">เปิดคำสั่งทีละใบ</p>
        <h1>{snapshot.public.phase === "SALVAGE" ? "สรุปความเสียหาย" : "กระสุนกำลังเดินทาง"}</h1>
        <p>จำรอยพลาดด้วยตัวเอง ระบบจะเก็บถาวรเฉพาะจุดที่คุณยิงโดน</p>
      </div>
      <div className="reveal-stage">
        {activeShot ? (
          <>
            <article className={`active-shot result-${activeShot.result.toLowerCase()}`}>
              <small>
                {nameOf(snapshot, activeShot.attackerId)} → {nameOf(snapshot, activeShot.targetId)}
                {" · "}นัด {activeNumber}
              </small>
              <strong>{activeShot.coordinate}</strong>
              <b>{resultLabel(activeShot.result)}</b>
            </article>
            {activeTrail.length > 0 && (
              <div className="active-shot-trail" aria-label={`นัดก่อนหน้าของ ${nameOf(snapshot, activeShot.attackerId)}`}>
                {activeTrail.map((shot) => (
                  <span key={shot.orderId}>
                    <b>{shot.coordinate}</b>
                    {nameOf(snapshot, shot.targetId)}
                    <small>{resultLabel(shot.result)}</small>
                  </span>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="empty-note">รอทุกคนพร้อมโจมตี…</p>
        )}
        <div className="completed-orders">
          {completedByAttacker.map(({ attackerId, shots }) => (
            <details key={attackerId}>
              <summary>
                <span>คำสั่งของ {nameOf(snapshot, attackerId)}</span>
                <b>{shots.length} นัด</b>
              </summary>
              <div>
                {shots.map((shot) => (
                  <article className={`reveal-card result-${shot.result.toLowerCase()}`} key={shot.orderId}>
                    <small>{nameOf(snapshot, shot.attackerId)} → {nameOf(snapshot, shot.targetId)}</small>
                    <strong>{shot.coordinate}</strong>
                    <b>{resultLabel(shot.result)}</b>
                  </article>
                ))}
              </div>
            </details>
          ))}
        </div>
      </div>
      <div className="fleet-status">
        {snapshot.public.seats.map((seat) => (
          <div key={seat.id} className={seat.eliminated ? "is-eliminated" : ""}>
            <span>{seat.name}</span><b>{seat.eliminated ? "กองเรือจม" : "ยังรบอยู่"}</b>
          </div>
        ))}
      </div>
    </section>
  );
}

export function SpectatorScreen({ snapshot }: { snapshot: GameSnapshot }) {
  return (
    <section className="spectator-sheet">
      <p className="eyebrow">โหมดผู้สังเกตการณ์</p>
      <h1>กองเรือคุณจมแล้ว</h1>
      <p>
        คุณยังดูช่วงเปิดคำสั่ง แชต และส่ง reaction ได้
        แต่ระบบจะไม่แสดงสมุดลับหรือคำสั่งของผู้เล่นที่ยังอยู่
      </p>
      <div className="fleet-status">
        {snapshot.public.seats.map((seat) => (
          <div key={seat.id} className={seat.eliminated ? "is-eliminated" : ""}>
            <span>{seat.name}</span>
            <b>{seat.eliminated ? "กองเรือจม" : "กำลังเขียนคำสั่ง"}</b>
          </div>
        ))}
      </div>
    </section>
  );
}

function ResultsScreen({ snapshot, onLeave }: { snapshot: GameSnapshot; onLeave: () => void }) {
  const winner = snapshot.public.seats.find((seat) => seat.id === snapshot.public.winnerId);
  return (
    <section className="results-sheet">
      <p className="eyebrow">รายงานหลังการรบ</p>
      <h1>{winner?.name ?? "ไม่มีผู้รอด"} ชนะ</h1>
      <p>สมุดทุกเล่มปิดแล้ว การยิงทั้งหมด {snapshot.reveal.length} นัดในรอบสุดท้าย</p>
      <div className="result-seats">
        {snapshot.public.seats.map((seat, index) => (
          <div key={seat.id}><span>{index + 1}</span><strong>{seat.name}</strong><small>{seat.id === winner?.id ? "ผู้รอดคนสุดท้าย" : "กองเรือจม"}</small></div>
        ))}
      </div>
      <button className="button primary" onClick={onLeave}>กลับหน้าแรก</button>
    </section>
  );
}

export function SocialBar({
  session,
  messages,
}: {
  session: Session;
  messages: Array<{ playerId?: string; text: string }>;
}) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const previousMessageCount = useRef(messages.length);
  useEffect(() => {
    const added = Math.max(0, messages.length - previousMessageCount.current);
    previousMessageCount.current = messages.length;
    if (!open && added > 0) setUnread((current) => current + added);
  }, [messages.length, open]);
  const openChat = () => {
    setOpen(true);
    setUnread(0);
  };
  const send = () => {
    if (!text.trim()) return;
    void emitAck("chat:send", { ...session, text });
    setText("");
  };
  if (!open) {
    const label = unread > 0 ? `เปิดแชต มี ${unread} ข้อความใหม่` : "เปิดแชต";
    return (
      <button className="chat-fab" aria-label={label} onClick={openChat}>
        แชต
        {unread > 0 && <b>{unread}</b>}
      </button>
    );
  }
  return (
    <aside className="social-bar" aria-label="แชตและรีแอ็กชัน">
      <div className="chat-header">
        <strong>วงสนทนา</strong>
        <button aria-label="ย่อแชต" onClick={() => setOpen(false)}>ย่อ</button>
      </div>
      <div className="chat-log">
        {messages.map((message, index) => <p key={index}>{message.text}</p>)}
      </div>
      <div className="reaction-row">
        {["โดน!", "โอ๊ย", "จมแล้ว", "ยิงซ้ำศพ"].map((item) => (
          <button key={item} onClick={() => void emitAck("reaction:send", { ...session, reaction: item })}>
            {item}
          </button>
        ))}
      </div>
      <div className="chat-compose">
        <input
          value={text}
          placeholder="แซวเพื่อน..."
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && send()}
        />
        <button onClick={send}>ส่ง</button>
      </div>
    </aside>
  );
}

export function Toast({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 4_000);
    return () => window.clearTimeout(timer);
  }, [message]);
  return (
    <div className="toast error-note" role="alert">
      <span>{message}</span>
      <button aria-label="ปิดการแจ้งเตือน" onClick={onDismiss}>×</button>
    </div>
  );
}

function useCountdown(deadlineAt: number | null) {
  const [, forceRender] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => forceRender((value) => value + 1), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  return useMemo(
    () => deadlineAt ? Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1_000)) : 0,
    [deadlineAt, Math.floor(Date.now() / 1_000)],
  );
}

function nameOf(snapshot: GameSnapshot, playerId: string) {
  return snapshot.public.seats.find((seat) => seat.id === playerId)?.name ?? "ไม่ทราบชื่อ";
}

function resultLabel(result: RevealEntry["result"]) {
  return {
    WATER: "น้ำ",
    LAND_SALVAGED: "ตกบนดิน · เก็บกู้",
    HIT: "โดน",
    SUNK: "จม",
    WRECK: "ซากเดิม",
  }[result];
}

function planningStatus(seat: GameSnapshot["public"]["seats"][number]) {
  if (seat.eliminated) return "ตกรอบ";
  if (!seat.connected) return "หลุด";
  if (seat.sealed) return "พร้อมโจมตีแล้ว";
  return "กำลังเลือกเป้า";
}

function groupReveal(reveal: RevealEntry[]) {
  const groups: Array<{ attackerId: string; shots: RevealEntry[] }> = [];
  for (const shot of reveal) {
    const current = groups.at(-1);
    if (current?.attackerId === shot.attackerId) current.shots.push(shot);
    else groups.push({ attackerId: shot.attackerId, shots: [shot] });
  }
  return groups;
}

function labelError(error?: string) {
  return errorLabels[error ?? ""] ?? error ?? "เกิดข้อผิดพลาด ลองอีกครั้ง";
}

function readSession(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(sessionKey) ?? "null") as Session | null;
  } catch {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem(sessionKey);
}
