import React, { useEffect, useState } from 'react';
import { Gift, Plus, Save, ShoppingBag, Trash2 } from 'lucide-react';
import type {
  EntertainmentConfig,
  ShopEffectType,
  ShopItem,
  TriviaQuestion,
} from '../shared/types.ts';

interface EntertainmentPanelProps {
  entertainment: EntertainmentConfig;
  onSave: (next: EntertainmentConfig) => Promise<void>;
  onCreateGiveaway: (prize: string, winnersCount: number, durationMin: number) => Promise<void>;
  onCloseGiveaway: (giveawayId: string) => Promise<void>;
}

export const EntertainmentPanel: React.FC<EntertainmentPanelProps> = ({
  entertainment,
  onSave,
  onCreateGiveaway,
  onCloseGiveaway,
}) => {
  const [draft, setDraft] = useState<EntertainmentConfig>(entertainment);
  const [saving, setSaving] = useState(false);

  // Shop form
  const [itemTitle, setItemTitle] = useState('');
  const [itemDesc, setItemDesc] = useState('');
  const [itemPrice, setItemPrice] = useState(250);
  const [itemEffect, setItemEffect] = useState<ShopEffectType>('badge');
  const [itemBadge, setItemBadge] = useState('');

  // Trivia form
  const [trivQuestion, setTrivQuestion] = useState('');
  const [trivOptA, setTrivOptA] = useState('');
  const [trivOptB, setTrivOptB] = useState('');
  const [trivOptC, setTrivOptC] = useState('');
  const [trivCorrect, setTrivCorrect] = useState(0);

  // Hangman word
  const [newWord, setNewWord] = useState('');

  // Giveaway launcher
  const [gPrize, setGPrize] = useState('Membresía VIP 30 días');
  const [gWinners, setGWinners] = useState(1);
  const [gDuration, setGDuration] = useState(30);

  useEffect(() => {
    setDraft(entertainment);
  }, [entertainment]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  const addShopItem = () => {
    if (!itemTitle.trim() || !itemDesc.trim()) return;
    const item: ShopItem = {
      id: `shop-${Date.now()}`,
      title: itemTitle.trim(),
      description: itemDesc.trim(),
      price: Math.max(1, itemPrice),
      effect: itemEffect,
      badgeLabel: itemEffect === 'badge' ? itemBadge.trim() || itemTitle.trim() : undefined,
      enabled: true,
    };
    setDraft({ ...draft, shopItems: [...draft.shopItems, item] });
    setItemTitle('');
    setItemDesc('');
    setItemBadge('');
  };

  const addTrivia = () => {
    const opts = [trivOptA.trim(), trivOptB.trim(), trivOptC.trim()].filter(Boolean);
    if (!trivQuestion.trim() || opts.length < 2) return;
    const q: TriviaQuestion = {
      id: `triv-${Date.now()}`,
      question: trivQuestion.trim(),
      options: opts,
      correctIndex: Math.min(trivCorrect, opts.length - 1),
      rewardCoins: 45,
      rewardXp: 35,
    };
    setDraft({ ...draft, triviaQuestions: [...draft.triviaQuestions, q] });
    setTrivQuestion('');
    setTrivOptA('');
    setTrivOptB('');
    setTrivOptC('');
    setTrivCorrect(0);
  };

  const addHangmanWord = () => {
    const w = newWord
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    if (w.length < 3 || draft.hangmanWords.includes(w)) return;
    setDraft({ ...draft, hangmanWords: [...draft.hangmanWords, w] });
    setNewWord('');
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSave} className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Entretenimiento, Niveles XP y Economía</h2>
            <p className="text-sm text-slate-500">
              Configura la moneda virtual, cooldowns anti-spam, tienda VIP y bancos de preguntas.
            </p>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50 rounded-md whitespace-nowrap"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Guardando...' : 'Guardar entretenimiento'}
          </button>
        </div>

        {/* Core Economy & Cooldown Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Control de Juegos y Horario Silencioso</h3>
                <p className="text-xs text-slate-500">Evita saturación en el grupo con enfriamientos por usuario.</p>
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.gamesEnabled}
                  onChange={(e) => setDraft({ ...draft, gamesEnabled: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 text-sky-600"
                />
                Juegos activos
              </label>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Cooldown (seg)</label>
                <input
                  type="number"
                  min={0}
                  max={300}
                  value={draft.gameCooldownSec}
                  onChange={(e) => setDraft({ ...draft, gameCooldownSec: Number(e.target.value) || 0 })}
                  className="w-full text-sm font-mono tabular-nums border border-slate-200 rounded-md px-3 py-1.5"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Inicio silencio (h)</label>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={draft.quietStartHour}
                  onChange={(e) => setDraft({ ...draft, quietStartHour: Number(e.target.value) || 0 })}
                  className="w-full text-sm font-mono tabular-nums border border-slate-200 rounded-md px-3 py-1.5"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Fin silencio (h)</label>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={draft.quietEndHour}
                  onChange={(e) => setDraft({ ...draft, quietEndHour: Number(e.target.value) || 7 })}
                  className="w-full text-sm font-mono tabular-nums border border-slate-200 rounded-md px-3 py-1.5"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.quietHoursEnabled}
                onChange={(e) => setDraft({ ...draft, quietHoursEnabled: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 text-sky-600"
              />
              Pausar juegos automáticamente durante el horario silencioso
            </label>
          </section>

          <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">Parámetros de XP y Moneda Virtual</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nombre moneda</label>
                <input
                  type="text"
                  value={draft.currencyName}
                  onChange={(e) => setDraft({ ...draft, currencyName: e.target.value })}
                  className="w-full text-sm border border-slate-200 rounded-md px-3 py-1.5"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">XP por mensaje</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={draft.xpPerMessage}
                  onChange={(e) => setDraft({ ...draft, xpPerMessage: Number(e.target.value) || 0 })}
                  className="w-full text-sm font-mono tabular-nums border border-slate-200 rounded-md px-3 py-1.5"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Monedas / msg</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={draft.coinsPerMessage}
                  onChange={(e) => setDraft({ ...draft, coinsPerMessage: Number(e.target.value) || 0 })}
                  className="w-full text-sm font-mono tabular-nums border border-slate-200 rounded-md px-3 py-1.5"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Premio /daily</label>
                <input
                  type="number"
                  min={10}
                  max={5000}
                  value={draft.dailyRewardCoins}
                  onChange={(e) => setDraft({ ...draft, dailyRewardCoins: Number(e.target.value) || 100 })}
                  className="w-full text-sm font-mono tabular-nums border border-slate-200 rounded-md px-3 py-1.5"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Costo /cofre</label>
                <input
                  type="number"
                  min={10}
                  max={2000}
                  value={draft.chestCostCoins}
                  onChange={(e) => setDraft({ ...draft, chestCostCoins: Number(e.target.value) || 80 })}
                  className="w-full text-sm font-mono tabular-nums border border-slate-200 rounded-md px-3 py-1.5"
                />
              </div>
            </div>
          </section>
        </div>

        {/* Shop Editor */}
        <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-sky-600" />
            <h3 className="text-sm font-semibold text-slate-900">Tienda del Grupo (/shop y /buy)</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
            <input
              type="text"
              value={itemTitle}
              onChange={(e) => setItemTitle(e.target.value)}
              placeholder="Título del artículo"
              className="md:col-span-3 text-xs border border-slate-200 rounded-md px-3 py-1.5"
            />
            <input
              type="text"
              value={itemDesc}
              onChange={(e) => setItemDesc(e.target.value)}
              placeholder="Descripción breve"
              className="md:col-span-3 text-xs border border-slate-200 rounded-md px-3 py-1.5"
            />
            <input
              type="number"
              min={1}
              value={itemPrice}
              onChange={(e) => setItemPrice(Number(e.target.value) || 100)}
              className="md:col-span-2 text-xs font-mono border border-slate-200 rounded-md px-3 py-1.5"
            />
            <select
              value={itemEffect}
              onChange={(e) => setItemEffect(e.target.value as ShopEffectType)}
              className="md:col-span-2 text-xs border border-slate-200 rounded-md px-2 py-1.5 bg-white"
            >
              <option value="badge">Insignia perfil</option>
              <option value="grant_vip">Otorgar VIP</option>
              <option value="remove_warn">Quitar 1 Warn</option>
              <option value="custom">Artículo visual</option>
            </select>
            <button
              type="button"
              onClick={addShopItem}
              className="md:col-span-2 inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md"
            >
              <Plus className="w-3.5 h-3.5" />
              Añadir
            </button>
          </div>

          {itemEffect === 'badge' && (
            <input
              type="text"
              value={itemBadge}
              onChange={(e) => setItemBadge(e.target.value)}
              placeholder="Nombre de la insignia (ej. Leyenda)"
              className="w-full sm:w-64 text-xs border border-slate-200 rounded-md px-3 py-1.5"
            />
          )}

          <div className="divide-y divide-slate-100 border border-slate-200 rounded-md">
            {draft.shopItems.map((item) => (
              <div key={item.id} className="p-3 flex items-center justify-between gap-4 text-xs">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900">
                    {item.title} · <span className="font-mono text-sky-700">{item.price} {draft.currencyName}</span>
                  </div>
                  <div className="text-slate-500">{item.description} · Efecto: {item.effect}</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <label className="inline-flex items-center gap-1.5 text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={item.enabled}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          shopItems: draft.shopItems.map((s) =>
                            s.id === item.id ? { ...s, enabled: e.target.checked } : s
                          ),
                        })
                      }
                      className="w-4 h-4 rounded border-slate-300 text-sky-600"
                    />
                    Activo
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        shopItems: draft.shopItems.filter((s) => s.id !== item.id),
                      })
                    }
                    className="text-slate-400 hover:text-rose-600"
                    aria-label={`Eliminar ${item.title}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Trivia & Hangman Bank */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <section className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">Banco de Preguntas (/trivia)</h3>
            <div className="space-y-2">
              <input
                type="text"
                value={trivQuestion}
                onChange={(e) => setTrivQuestion(e.target.value)}
                placeholder="Nueva pregunta de trivia..."
                className="w-full text-xs border border-slate-200 rounded-md px-3 py-1.5"
              />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  value={trivOptA}
                  onChange={(e) => setTrivOptA(e.target.value)}
                  placeholder="Opción A"
                  className="text-xs border border-slate-200 rounded-md px-3 py-1.5"
                />
                <input
                  type="text"
                  value={trivOptB}
                  onChange={(e) => setTrivOptB(e.target.value)}
                  placeholder="Opción B"
                  className="text-xs border border-slate-200 rounded-md px-3 py-1.5"
                />
                <input
                  type="text"
                  value={trivOptC}
                  onChange={(e) => setTrivOptC(e.target.value)}
                  placeholder="Opción C (opcional)"
                  className="text-xs border border-slate-200 rounded-md px-3 py-1.5"
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-600">Correcta:</span>
                  <select
                    value={trivCorrect}
                    onChange={(e) => setTrivCorrect(Number(e.target.value))}
                    className="border border-slate-200 rounded px-2 py-1 bg-white"
                  >
                    <option value={0}>Opción A</option>
                    <option value={1}>Opción B</option>
                    <option value={2}>Opción C</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={addTrivia}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Agregar pregunta
                </button>
              </div>
            </div>

            <div className="divide-y divide-slate-100 border border-slate-200 rounded-md max-h-48 overflow-y-auto">
              {draft.triviaQuestions.map((q) => (
                <div key={q.id} className="p-2.5 flex items-start justify-between gap-3 text-xs">
                  <div>
                    <div className="font-medium text-slate-900">{q.question}</div>
                    <div className="text-slate-500">
                      Correcta: <span className="text-emerald-700 font-medium">{q.options[q.correctIndex]}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        triviaQuestions: draft.triviaQuestions.filter((item) => item.id !== q.id),
                      })
                    }
                    className="text-slate-400 hover:text-rose-600 shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">Palabras para Ahorcado (/ahorcado)</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={newWord}
                onChange={(e) => setNewWord(e.target.value)}
                placeholder="Nueva palabra (ej. COMUNIDAD)"
                className="flex-1 text-xs font-mono uppercase border border-slate-200 rounded-md px-3 py-1.5"
              />
              <button
                type="button"
                onClick={addHangmanWord}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md"
              >
                <Plus className="w-3.5 h-3.5" />
                Añadir
              </button>
            </div>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-md max-h-48 overflow-y-auto">
              {draft.hangmanWords.map((w) => (
                <div key={w} className="px-3 py-1.5 flex items-center justify-between text-xs">
                  <span className="font-mono text-slate-800">{w}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        hangmanWords: draft.hangmanWords.filter((word) => word !== w),
                      })
                    }
                    className="text-slate-400 hover:text-rose-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      </form>

      {/* Live Giveaways Manager */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Gift className="w-4 h-4 text-sky-600" />
          <h3 className="text-sm font-semibold text-slate-900">Gestor de Sorteos (/sorteo)</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
          <div className="sm:col-span-6">
            <label className="block text-xs font-medium text-slate-700 mb-1">Premio del sorteo</label>
            <input
              type="text"
              value={gPrize}
              onChange={(e) => setGPrize(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-md px-3 py-1.5"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">Ganadores</label>
            <input
              type="number"
              min={1}
              max={10}
              value={gWinners}
              onChange={(e) => setGWinners(Number(e.target.value) || 1)}
              className="w-full text-xs font-mono border border-slate-200 rounded-md px-3 py-1.5"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">Minutos</label>
            <input
              type="number"
              min={1}
              max={10080}
              value={gDuration}
              onChange={(e) => setGDuration(Number(e.target.value) || 10)}
              className="w-full text-xs font-mono border border-slate-200 rounded-md px-3 py-1.5"
            />
          </div>
          <button
            type="button"
            onClick={() => gPrize.trim() && onCreateGiveaway(gPrize.trim(), gWinners, gDuration)}
            className="sm:col-span-2 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md whitespace-nowrap"
          >
            Lanzar sorteo
          </button>
        </div>

        <div className="divide-y divide-slate-100 border border-slate-200 rounded-md">
          {entertainment.activeGiveaways.length === 0 ? (
            <div className="p-4 text-xs text-slate-500 text-center">
              No hay sorteos registrados. Lanza uno aquí o usa /sorteo en el chat.
            </div>
          ) : (
            [...entertainment.activeGiveaways].reverse().map((g) => (
              <div key={g.id} className="p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <div className="font-semibold text-slate-900">{g.prize}</div>
                  <div className="text-slate-500 font-mono">
                    Estado: {g.status === 'active' ? 'Activo' : 'Finalizado'} · Participantes:{' '}
                    {g.participants.length} · Ganadores: {g.winnersCount}
                  </div>
                </div>
                {g.status === 'active' && (
                  <button
                    type="button"
                    onClick={() => onCloseGiveaway(g.id)}
                    className="px-3 py-1.5 text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-md"
                  >
                    Sortear ahora
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
};
