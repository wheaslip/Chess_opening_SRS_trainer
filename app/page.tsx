'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import {
  ArrowLeft,
  BookOpen,
  Brain,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Download,
  FlipVertical2,
  GraduationCap,
  Library,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  Trophy,
  Undo2,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast, Toaster } from '@/components/ui/toast';

type Side = 'white' | 'black';
type Mode = 'home' | 'teach' | 'learn' | 'library' | 'practice' | 'complete';

type RecordedMove = {
  from: string;
  to: string;
  promotion?: string;
  san: string;
};

type OpeningLine = {
  id: string;
  name: string;
  side: Side;
  moves: RecordedMove[];
  createdAt: number;
  inSrs: boolean;
  level: number;
  dueAt: number | null;
  lastReviewedAt?: number;
};

const STORAGE_KEY = 'repertoire-opening-lines-v1';
const SRS_DAYS = [0, 1, 3, 7, 14, 30, 60, 120];

function lineNotation(line: OpeningLine) {
  return line.moves.map((move, index) => `${index % 2 === 0 ? `${Math.floor(index / 2) + 1}.` : ''}${move.san}`).join(' ');
}

function formatDue(line: OpeningLine, now: number) {
  if (!line.inSrs || line.dueAt === null) return 'Not in SRS';
  const diff = line.dueAt - now;
  if (diff <= 0) return 'Due now';
  const days = Math.ceil(diff / 86_400_000);
  return days === 1 ? 'Due tomorrow' : `Due in ${days} days`;
}

function randomize<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function playWoodenThunk(capture = false) {
  if (typeof window === 'undefined') return;
  const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;
  const ctx = new AudioCtx();
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  const oscillator = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const duration = capture ? 0.105 : 0.055;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2.6);
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(capture ? 520 : 720, now);
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(capture ? 108 : 155, now);
  oscillator.frequency.exponentialRampToValueAtTime(capture ? 48 : 74, now + (capture ? 0.14 : 0.08));
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(capture ? 0.3 : 0.22, now + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + (capture ? 0.17 : 0.11));
  noise.connect(filter).connect(gain);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  noise.start(now);
  oscillator.start(now);
  noise.stop(now + (capture ? 0.12 : 0.07));
  oscillator.stop(now + (capture ? 0.17 : 0.11));
  window.setTimeout(() => void ctx.close(), capture ? 290 : 220);
}

export default function Home() {
  const [mode, setMode] = useState<Mode>('home');
  const [lines, setLines] = useState<OpeningLine[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [loaded, setLoaded] = useState(false);
  const [orientation, setOrientation] = useState<Side>('white');
  const [fen, setFen] = useState(() => new Chess().fen());
  const [recordedMoves, setRecordedMoves] = useState<RecordedMove[]>([]);
  const [lineName, setLineName] = useState('');
  const [saveOpen, setSaveOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateName, setDuplicateName] = useState('');
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [sessionQueue, setSessionQueue] = useState<string[]>([]);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [moveIndex, setMoveIndex] = useState(0);
  const [locked, setLocked] = useState(false);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionMistakes, setSessionMistakes] = useState(0);
  const gameRef = useRef(new Chess());
  const linesRef = useRef(lines);
  const backupInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) setLines(JSON.parse(saved));
      } catch {
        toast.add({ title: 'Could not load your repertoire', description: 'Local storage may be unavailable.', type: 'error' });
      }
      setLoaded(true);
    });
  }, []);

  useEffect(() => { linesRef.current = lines; }, [lines]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  }, [lines, loaded]);

  const activeLine = useMemo(() => lines.find((line) => line.id === activeLineId) ?? null, [lines, activeLineId]);
  const dueWhite = lines.filter((line) => line.inSrs && line.side === 'white' && (line.dueAt ?? 0) <= now).length;
  const dueBlack = lines.filter((line) => line.inSrs && line.side === 'black' && (line.dueAt ?? 0) <= now).length;
  const storedLines = lines.filter((line) => !line.inSrs);
  const activeLines = lines.filter((line) => line.inSrs).length;

  const resetBoard = useCallback(() => {
    gameRef.current = new Chess();
    setFen(gameRef.current.fen());
    setSelectedSquare(null);
    setLastMove(null);
  }, []);

  const goHome = useCallback(() => {
    setMode('home');
    setFeedback(null);
    setLocked(false);
    setActiveLineId(null);
    setSessionQueue([]);
    setDuplicateOpen(false);
    resetBoard();
  }, [resetBoard]);

  const startTeach = useCallback(() => {
    resetBoard();
    setRecordedMoves([]);
    setLineName('');
    setOrientation('white');
    setMode('teach');
  }, [resetBoard]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: unknown, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = async () => {
      await context.registerTool({
        name: 'get_repertoire_summary',
        title: 'Get repertoire summary',
        description: 'Read the number of saved, active, and currently due chess opening lines.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute: () => ({
          totalLines: linesRef.current.length,
          activeLines: linesRef.current.filter((line) => line.inSrs).length,
          dueLines: linesRef.current.filter((line) => line.inSrs && (line.dueAt ?? 0) <= Date.now()).length,
        }),
      }, { signal: lifecycle.signal });
      await context.registerTool({
        name: 'start_teaching_line',
        title: 'Start teaching a line',
        description: 'Open Teach mode with a fresh chess position so the user can record a new legal line.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: () => { startTeach(); return { mode: 'teach', position: 'starting' }; },
      }, { signal: lifecycle.signal });
    };
    void register().catch(() => undefined);
    return () => lifecycle.abort();
  }, [startTeach]);

  const advanceLine = useCallback((succeeded: boolean) => {
    setFeedback(null);
    setLocked(false);
    setSessionQueue((current) => {
      const [, ...remaining] = current;
      const nextQueue = succeeded ? remaining : [...remaining, current[0]];
      if (nextQueue.length === 0) {
        setMode('complete');
        setActiveLineId(null);
        window.setTimeout(() => setMode('home'), 2400);
        return [];
      }
      setActiveLineId(nextQueue[0]);
      gameRef.current = new Chess();
      setFen(gameRef.current.fen());
      setMoveIndex(0);
      setLastMove(null);
      return nextQueue;
    });
  }, []);

  const finishLine = useCallback((line: OpeningLine) => {
    setLocked(true);
    setFeedback('correct');
    setSessionCorrect((count) => count + 1);
    const nextLevel = Math.min(SRS_DAYS.length - 1, mode === 'learn' ? 1 : line.level + 1);
    setLines((current) => current.map((item) => item.id === line.id ? {
      ...item,
      inSrs: true,
      level: nextLevel,
      dueAt: Date.now() + SRS_DAYS[nextLevel] * 86_400_000,
      lastReviewedAt: Date.now(),
    } : item));
    window.setTimeout(() => advanceLine(true), 850);
  }, [mode, advanceLine]);

  const tryMove = useCallback((sourceSquare: string, targetSquare: string | null) => {
    if (!targetSquare || locked) return false;
    const game = gameRef.current;
    const promotion = game.get(sourceSquare as Square)?.type === 'p' && ['1', '8'].includes(targetSquare[1]) ? 'q' : undefined;
    let move;
    try {
      move = game.move({ from: sourceSquare, to: targetSquare, promotion });
    } catch {
      setSelectedSquare(null);
      return false;
    }
    if (!move) return false;

    if (mode === 'teach') {
      const recorded = { from: move.from, to: move.to, promotion: move.promotion, san: move.san };
      setRecordedMoves((current) => [...current, recorded]);
      setFen(game.fen());
      setLastMove({ from: move.from, to: move.to });
      setSelectedSquare(null);
      playWoodenThunk(Boolean(move.captured));
      return true;
    }

    if ((mode === 'practice' || mode === 'learn') && activeLine) {
      const expected = activeLine.moves[moveIndex];
      const matches = expected && move.from === expected.from && move.to === expected.to && (move.promotion ?? '') === (expected.promotion ?? '');
      if (!matches) {
        game.undo();
        setFen(game.fen());
        setSelectedSquare(null);
        setLocked(true);
        setFeedback('wrong');
        setSessionMistakes((count) => count + 1);
        playWoodenThunk(Boolean(move.captured));
        if (mode === 'practice') {
          setLines((current) => current.map((line) => line.id === activeLine.id ? { ...line, level: Math.max(0, line.level - 1), lastReviewedAt: Date.now() } : line));
        }
        toast.add({ title: 'Not this move', description: `Review the correct move below the board, then continue.`, type: 'error' });
        return false;
      }
      setFen(game.fen());
      setLastMove({ from: move.from, to: move.to });
      setSelectedSquare(null);
      playWoodenThunk(Boolean(move.captured));
      const nextIndex = moveIndex + 1;
      setMoveIndex(nextIndex);
      if (nextIndex >= activeLine.moves.length) finishLine(activeLine);
      return true;
    }
    game.undo();
    return false;
  }, [mode, activeLine, moveIndex, locked, finishLine]);

  useEffect(() => {
    if ((mode !== 'practice' && mode !== 'learn') || !activeLine || locked) return;
    const playerColor = activeLine.side === 'white' ? 'w' : 'b';
    if (moveIndex >= activeLine.moves.length || gameRef.current.turn() === playerColor) return;
    const expected = activeLine.moves[moveIndex];
    const timer = window.setTimeout(() => {
      let move;
      try { move = gameRef.current.move({ from: expected.from, to: expected.to, promotion: expected.promotion }); } catch { move = null; }
      if (!move) {
        toast.add({ title: 'This saved line is invalid', description: 'Please record it again from Teach mode.', type: 'error' });
        advanceLine(true);
        return;
      }
      playWoodenThunk(Boolean(move.captured));
      setFen(gameRef.current.fen());
      setLastMove({ from: move.from, to: move.to });
      const nextIndex = moveIndex + 1;
      setMoveIndex(nextIndex);
      if (nextIndex >= activeLine.moves.length) finishLine(activeLine);
    }, 520);
    return () => window.clearTimeout(timer);
  }, [mode, activeLine, moveIndex, locked, advanceLine, finishLine]);

  const onSquareClick = ({ square }: { square: string }) => {
    if (locked) return;
    if (selectedSquare) {
      if (tryMove(selectedSquare, square)) return;
    }
    const piece = gameRef.current.get(square as Square);
    if (!piece) { setSelectedSquare(null); return; }
    if (mode === 'teach' || ((mode === 'practice' || mode === 'learn') && activeLine && piece.color === (activeLine.side === 'white' ? 'w' : 'b'))) setSelectedSquare(square);
  };

  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    const styleGame = new Chess(fen);
    if (lastMove) {
      styles[lastMove.from] = { background: 'rgba(221, 190, 85, .52)' };
      styles[lastMove.to] = { background: 'rgba(221, 190, 85, .62)' };
    }
    if (feedback === 'wrong' && activeLine) {
      const expected = activeLine.moves[moveIndex];
      if (expected) {
        styles[expected.from] = { background: 'rgba(214, 165, 69, .72)', boxShadow: 'inset 0 0 0 4px rgba(109, 67, 24, .42)' };
        styles[expected.to] = { background: 'rgba(214, 165, 69, .82)', boxShadow: 'inset 0 0 0 4px rgba(109, 67, 24, .52)' };
      }
    }
    if (selectedSquare) {
      styles[selectedSquare] = { background: 'rgba(255, 215, 86, .75)' };
      for (const move of styleGame.moves({ square: selectedSquare as Square, verbose: true })) {
        styles[move.to] = { background: styleGame.get(move.to as Square) ? 'radial-gradient(circle, transparent 52%, rgba(23,63,53,.5) 54%, rgba(23,63,53,.5) 64%, transparent 66%)' : 'radial-gradient(circle, rgba(23,63,53,.45) 18%, transparent 20%)' };
      }
    }
    return styles;
  }, [selectedSquare, lastMove, fen, feedback, activeLine, moveIndex]);

  const undoTeachMove = () => {
    const move = gameRef.current.undo();
    if (!move) return;
    setRecordedMoves((current) => current.slice(0, -1));
    setFen(gameRef.current.fen());
    setLastMove(null);
    playWoodenThunk();
  };

  const saveLine = (inSrs: boolean) => {
    const duplicate = lines.find((line) => line.side === orientation && line.moves.length === recordedMoves.length && line.moves.every((move, index) => sameMove(move, recordedMoves[index])));
    if (duplicate) {
      setSaveOpen(false);
      setDuplicateName(duplicate.name);
      setDuplicateOpen(true);
      return;
    }
    const created: OpeningLine = {
      id: crypto.randomUUID(),
      name: lineName.trim() || `Opening line ${lines.length + 1}`,
      side: orientation,
      moves: recordedMoves,
      createdAt: Date.now(),
      inSrs,
      level: 0,
      dueAt: inSrs ? now : null,
    };
    setLines((current) => [...current, created]);
    setSaveOpen(false);
    toast.add({ title: inSrs ? 'Added to today’s queue' : 'Saved for later', description: created.name, type: 'success' });
    goHome();
  };

  const beginSession = (ids: string[], nextMode: 'practice' | 'learn') => {
    const queue = randomize(ids);
    if (queue.length === 0) return;
    resetBoard();
    setSessionQueue(queue);
    setActiveLineId(queue[0]);
    setMoveIndex(0);
    setSessionCorrect(0);
    setSessionMistakes(0);
    setMode(nextMode);
    setLocked(false);
  };

  const startPractice = (side: Side) => {
    const due = lines.filter((line) => line.inSrs && line.side === side && (line.dueAt ?? 0) <= Date.now());
    if (!due.length) {
      toast.add({ title: `Nothing due as ${side}`, description: 'Teach a new line or check the other side.', type: 'info' });
      return;
    }
    beginSession(due.map((line) => line.id), 'practice');
  };

  const addToSrs = (id: string) => {
    setLines((current) => current.map((line) => line.id === id ? { ...line, inSrs: true, level: 0, dueAt: now } : line));
    toast.add({ title: 'Added to SRS', description: 'This line is ready to practice now.', type: 'success' });
  };

  const exportBackup = () => {
    const payload = {
      app: 'Repertoire',
      version: 1,
      exportedAt: new Date().toISOString(),
      lines,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `repertoire-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.add({ title: 'Backup exported', description: `${lines.length} ${lines.length === 1 ? 'line' : 'lines'}, including all SRS progress.`, type: 'success' });
  };

  const importBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text()) as { app?: unknown; version?: unknown; lines?: unknown };
      if (payload.app !== 'Repertoire' || payload.version !== 1 || !Array.isArray(payload.lines) || !payload.lines.every(isOpeningLine)) throw new Error('Invalid backup');
      const replacement = payload.lines as OpeningLine[];
      const confirmed = window.confirm(`Replace your current ${lines.length} ${lines.length === 1 ? 'line' : 'lines'} with the ${replacement.length} ${replacement.length === 1 ? 'line' : 'lines'} in this backup? SRS levels and due dates will also be restored.`);
      if (!confirmed) return;
      setLines(replacement);
      toast.add({ title: 'Backup restored', description: `${replacement.length} ${replacement.length === 1 ? 'line' : 'lines'} and all SRS progress imported.`, type: 'success' });
    } catch {
      toast.add({ title: 'Could not import this backup', description: 'Choose a JSON backup exported by Repertoire.', type: 'error' });
    }
  };

  const canDragPiece = ({ piece }: { piece: { pieceType: string } }) => {
    if (locked) return false;
    if (mode === 'teach') return true;
    if ((mode === 'practice' || mode === 'learn') && activeLine) {
      const color = piece.pieceType[0] === 'w' ? 'white' : 'black';
      return color === activeLine.side && gameRef.current.turn() === (activeLine.side === 'white' ? 'w' : 'b');
    }
    return false;
  };

  const boardOptions = {
    id: 'repertoire-board',
    position: fen,
    boardOrientation: (mode === 'practice' || mode === 'learn') && activeLine ? activeLine.side : orientation,
    allowDragging: mode === 'teach' || mode === 'practice' || mode === 'learn',
    canDragPiece,
    onPieceDrop: ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) => tryMove(sourceSquare, targetSquare),
    onSquareClick,
    squareStyles,
    arrows: feedback === 'wrong' && activeLine?.moves[moveIndex] ? [{ startSquare: activeLine.moves[moveIndex].from, endSquare: activeLine.moves[moveIndex].to, color: 'rgba(176, 112, 37, .82)' }] : [],
    animationDurationInMs: 180,
    boardStyle: { borderRadius: '3px' },
    darkSquareStyle: { backgroundColor: '#936f4d' },
    lightSquareStyle: { backgroundColor: '#ead9bd' },
    darkSquareNotationStyle: { color: '#ead9bd', fontWeight: 700 },
    lightSquareNotationStyle: { color: '#936f4d', fontWeight: 700 },
  } as const;

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand brand-button" onClick={goHome} aria-label="Go to home"><span className="brand-mark">♞</span><span>Repertoire</span></button>
        <div className="topbar-status"><span className="status-dot" /> Stored only on this computer</div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <nav aria-label="Main navigation">
            <button className={`nav-item ${mode === 'home' ? 'active' : ''}`} onClick={goHome}><Brain /> Today</button>
            <button className={`nav-item ${mode === 'teach' ? 'active' : ''}`} onClick={startTeach}><GraduationCap /> Teach</button>
            <button className={`nav-item ${mode === 'learn' ? 'active' : ''}`} onClick={() => setMode('learn')}><BookOpen /> Learn</button>
            <button className={`nav-item ${mode === 'library' ? 'active' : ''}`} onClick={() => setMode('library')}><Library /> Library <span className="nav-count">{lines.length}</span></button>
          </nav>
          <div className="sidebar-summary"><div><span>Due</span><strong>{dueWhite + dueBlack}</strong></div><div><span>Learning</span><strong>{activeLines}</strong></div></div>
        </aside>

        {mode === 'home' && (
          <section className="home-view">
            <div className="home-copy">
              <span className="eyebrow">TODAY&apos;S TRAINING</span>
              <h1>{dueWhite + dueBlack ? 'Your next move is waiting.' : 'Build a repertoire that sticks.'}</h1>
              <p>{dueWhite + dueBlack ? `${dueWhite + dueBlack} ${dueWhite + dueBlack === 1 ? 'line is' : 'lines are'} due for review.` : 'Record an opening line, then let spaced repetition bring it back at the right moment.'}</p>
              <div className="practice-actions">
                <button className="side-practice" onClick={() => startPractice('white')} disabled={!dueWhite}><span className="piece-chip white-piece">♔</span><span><small>Practice as</small>White</span><strong>{dueWhite}</strong></button>
                <button className="side-practice dark" onClick={() => startPractice('black')} disabled={!dueBlack}><span className="piece-chip black-piece">♚</span><span><small>Practice as</small>Black</span><strong>{dueBlack}</strong></button>
              </div>
              <button className="text-action" onClick={startTeach}><Plus /> Teach a new line</button>
            </div>
            <div className="home-board-wrap"><div className="board-frame"><Chessboard options={{ ...boardOptions, id: 'home-board', allowDragging: false }} /></div><div className="board-caption"><span><span className="status-dot" /> Ready</span><span>{activeLines} active {activeLines === 1 ? 'line' : 'lines'}</span></div></div>
          </section>
        )}

        {mode === 'teach' && (
          <section className="trainer-view">
            <div className="board-panel">
              <div className="view-heading mobile-heading"><span className="eyebrow">TEACH MODE</span><h2>Record a new line</h2></div>
              <div className="board-frame"><Chessboard options={boardOptions} /></div>
              <div className="board-toolbar"><Button variant="outline" onClick={undoTeachMove} disabled={!recordedMoves.length}><Undo2 /> Undo</Button><Button variant="outline" onClick={() => setOrientation((side) => side === 'white' ? 'black' : 'white')}><FlipVertical2 /> Flip board</Button></div>
            </div>
            <aside className="session-panel">
              <div className="view-heading"><span className="eyebrow">TEACH MODE</span><h2>Record a new line</h2><p>Play both sides from the starting position. Every move must be legal.</p></div>
              <div className="playing-as"><span>You will practice as</span><strong>{orientation === 'white' ? '♔ White' : '♚ Black'}</strong></div>
              <div className="move-sheet"><div className="move-sheet-head"><span>Moves</span><span>{recordedMoves.length}</span></div>{recordedMoves.length ? <div className="moves-grid">{recordedMoves.map((move, index) => <span key={`${move.from}-${move.to}-${index}`}><small>{index % 2 === 0 ? `${Math.floor(index / 2) + 1}.` : '…'}</small>{move.san}</span>)}</div> : <div className="empty-moves"><span>♙</span><p>Make the first move on the board.</p></div>}</div>
              <Button size="lg" className="finish-button" disabled={!recordedMoves.length} onClick={() => setSaveOpen(true)}>Finish line <Check /></Button>
              <button className="cancel-action" onClick={goHome}>Cancel</button>
            </aside>
          </section>
        )}

        {(mode === 'practice' || (mode === 'learn' && activeLine)) && activeLine && (
          <section className={`trainer-view ${feedback ? `feedback-${feedback}` : ''}`}>
            <div className="board-panel">
              <div className="view-heading mobile-heading"><span className="eyebrow">{mode === 'learn' ? 'LEARN MODE' : 'PRACTICE'}</span><h2>{activeLine.name}</h2></div>
              <div className="board-shell"><div className="board-frame"><Chessboard options={boardOptions} /></div>{feedback === 'correct' && <div className="feedback-overlay"><span className="feedback-icon"><Check /></span><strong>Line complete</strong><small>{mode === 'learn' ? 'Added to your SRS' : 'Scheduled further out'}</small></div>}</div>
              {feedback === 'wrong' && <output className="mistake-review" aria-live="assertive"><span className="mistake-icon"><CircleAlert /></span><div><small>Correct move</small><strong>{activeLine.moves[moveIndex]?.san}</strong><span>{activeLine.moves[moveIndex]?.from} → {activeLine.moves[moveIndex]?.to}</span></div><Button onClick={() => advanceLine(false)}>Continue <ChevronRight /></Button></output>}
            </div>
            <aside className="session-panel">
              <div className="view-heading"><span className="eyebrow">{mode === 'learn' ? 'LEARN MODE' : 'PRACTICE'}</span><h2>{activeLine.name}</h2><p>Find the next move as {activeLine.side}. Your opponent replies automatically.</p></div>
              <div className="move-sheet compact"><div className="move-sheet-head"><span>Moves played</span><span>{sessionQueue.length} left</span></div><div className="moves-grid muted-moves">{activeLine.moves.slice(0, moveIndex).map((move, index) => <span key={`${move.from}-${index}`}><small>{index % 2 === 0 ? `${Math.floor(index / 2) + 1}.` : '…'}</small>{move.san}</span>)}</div></div>
              <div className="session-score"><span><Check /> {sessionCorrect} complete</span><span><RotateCcw /> {sessionMistakes} retries</span></div>
              <button className="cancel-action" onClick={goHome}><ArrowLeft /> End session</button>
            </aside>
          </section>
        )}

        {mode === 'learn' && !activeLine && (
          <section className="collection-view"><div className="collection-heading"><div><span className="eyebrow">LEARN MODE</span><h2>Learn a saved line</h2><p>Practice a stored line once to add it to your spaced-repetition queue.</p></div><Button onClick={startTeach}><Plus /> New line</Button></div>{storedLines.length ? <div className="line-list">{storedLines.map((line) => <article className="line-card" key={line.id}><span className={`side-badge ${line.side}`}>{line.side === 'white' ? '♔' : '♚'} {line.side}</span><h3>{line.name}</h3><p>{lineNotation(line)}</p><div><span>{line.moves.length} moves</span><Button onClick={() => beginSession([line.id], 'learn')}><Play /> Learn this line</Button></div></article>)}</div> : <EmptyCollection title="Nothing waiting to learn" copy="Lines you save for later will appear here." action={startTeach} />}</section>
        )}

        {mode === 'library' && (
          <section className="collection-view">
            <div className="collection-heading">
              <div><span className="eyebrow">LIBRARY</span><h2>Your opening lines</h2><p>Everything stays in this browser on this computer.</p></div>
              <div className="collection-actions">
                <input ref={backupInputRef} className="backup-input" type="file" accept="application/json,.json" onChange={importBackup} />
                <Button variant="outline" onClick={() => backupInputRef.current?.click()}><Upload /> Import backup</Button>
                <Button variant="outline" onClick={exportBackup}><Download /> Export backup</Button>
                <Button onClick={startTeach}><Plus /> New line</Button>
              </div>
            </div>
            <p className="backup-note">Backups include every move, current SRS level, review history, and due date.</p>
            {lines.length ? <div className="line-list">{lines.map((line) => <article className="line-card" key={line.id}><div className="card-top"><span className={`side-badge ${line.side}`}>{line.side === 'white' ? '♔' : '♚'} {line.side}</span><span className={line.inSrs ? 'srs-badge active' : 'srs-badge'}>{formatDue(line, now)}</span></div><h3>{line.name}</h3><p>{lineNotation(line)}</p><div><span>{line.moves.length} moves · Level {line.level}</span><span className="card-actions">{!line.inSrs && <Button variant="outline" onClick={() => addToSrs(line.id)}>Add to SRS</Button>}<Button variant="ghost" size="icon" aria-label={`Delete ${line.name}`} onClick={() => { if (window.confirm(`Delete “${line.name}”?`)) setLines((current) => current.filter((item) => item.id !== line.id)); }}><Trash2 /></Button></span></div></article>)}</div> : <EmptyCollection title="Your library is empty" copy="Teach your first opening line to begin." action={startTeach} />}
          </section>
        )}

        {mode === 'complete' && <section className="complete-view"><span className="trophy-ring"><Trophy /></span><span className="eyebrow">SESSION COMPLETE</span><h2>Nicely played.</h2><p>{sessionCorrect} {sessionCorrect === 1 ? 'line' : 'lines'} completed with {sessionMistakes} {sessionMistakes === 1 ? 'retry' : 'retries'}.</p><Button onClick={goHome}>Back to today <ChevronRight /></Button></section>}
      </div>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="save-dialog">
          <DialogHeader><DialogTitle>Name this line</DialogTitle><DialogDescription>Choose whether to review it now or keep it in Learn for later.</DialogDescription></DialogHeader>
          <label className="field-label" htmlFor="line-name">Line name</label>
          <Input id="line-name" value={lineName} onChange={(event) => setLineName(event.target.value)} placeholder="e.g. Caro–Kann, Advance Variation" />
          <div className="save-summary"><span className={`piece-chip ${orientation === 'white' ? 'white-piece' : 'black-piece'}`}>{orientation === 'white' ? '♔' : '♚'}</span><span><strong>Practice as {orientation}</strong><small>{recordedMoves.length} moves recorded</small></span></div>
          <DialogFooter className="save-actions"><Button variant="outline" onClick={() => saveLine(false)}><Clock3 /> Save for later</Button><Button onClick={() => saveLine(true)}><Brain /> Add to SRS now</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={duplicateOpen} onOpenChange={setDuplicateOpen}>
        <DialogContent className="save-dialog">
          <DialogHeader><DialogTitle>This line is already saved</DialogTitle><DialogDescription>The exact same sequence already exists from the {orientation} viewpoint as “{duplicateName}”. No duplicate was added.</DialogDescription></DialogHeader>
          <div className="duplicate-summary"><span className={`piece-chip ${orientation === 'white' ? 'white-piece' : 'black-piece'}`}>{orientation === 'white' ? '♔' : '♚'}</span><span><strong>{duplicateName}</strong><small>{recordedMoves.length} matching moves</small></span></div>
          <DialogFooter><Button variant="outline" onClick={() => setDuplicateOpen(false)}>Keep editing</Button><Button onClick={() => { setDuplicateOpen(false); setMode('library'); }}>Go to library</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Toaster />
    </main>
  );
}

function EmptyCollection({ title, copy, action }: { title: string; copy: string; action: () => void }) {
  return <div className="empty-collection"><span>♞</span><h3>{title}</h3><p>{copy}</p><Button onClick={action}><Plus /> Teach a line</Button></div>;
}

function isOpeningLine(value: unknown): value is OpeningLine {
  if (!value || typeof value !== 'object') return false;
  const line = value as Partial<OpeningLine>;
  return typeof line.id === 'string'
    && typeof line.name === 'string'
    && (line.side === 'white' || line.side === 'black')
    && Array.isArray(line.moves)
    && line.moves.length > 0
    && line.moves.every((move) => move && typeof move.from === 'string' && typeof move.to === 'string' && typeof move.san === 'string')
    && typeof line.createdAt === 'number'
    && typeof line.inSrs === 'boolean'
    && typeof line.level === 'number'
    && (line.dueAt === null || typeof line.dueAt === 'number');
}

function sameMove(left: RecordedMove, right: RecordedMove) {
  return left.from === right.from && left.to === right.to && (left.promotion ?? '') === (right.promotion ?? '');
}
