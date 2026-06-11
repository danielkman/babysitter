/**
 * Inquiry Dock (SPEC-V3 §V3-5, AC32): bottom-left chat-like stack of
 * inquiry bubbles, replacing the v1 AlertBanner role. Newest first, at most
 * three visible (+N more chip). Each bubble: agent portrait chip, serif
 * question, and an AskUserQuestion-style option row — every option renders
 * its microagent-generated engraved-brass icon ABOVE a short caption
 * (`inquiry-opt-<hookRequestId>-<optionId>`), garnet-tinted when
 * tone=danger, brass-glow when tone=primary. Choosing an option posts
 * `hook.decision` + optionId via `orders.answerInquiry`; the bubble resolves
 * with a brief wax-stamp animation (a ghost WITHOUT the inquiry testid)
 * then archives. Space pulses the dock (scroll into view + highlight).
 */

import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import clsx from 'clsx';

import { dockView } from '../../game/inquiries';
import type { CommanderStore, Orders } from '../../game/store';
import type { SimInquiryOption, SimInquiryView } from '../../backend/mock/simulation';
import { generateIcon } from '../../microagent/mock/iconGen';
import { generateOptionIcon } from '../../microagent/mock/optionIconGen';

const STAMP_MS = 650;
const PULSE_MS = 900;

export interface ChatDockProps {
  store: CommanderStore;
  orders: Orders;
}

/** Option button row — shared look for dock bubbles (icon ABOVE caption). */
export function InquiryOptionRow({
  inquiry,
  onChoose,
  withTestIds,
}: {
  inquiry: SimInquiryView;
  onChoose: (option: SimInquiryOption) => void;
  withTestIds: boolean;
}): React.JSX.Element {
  return (
    <div className="wr-inq-options" role="group" aria-label="Inquiry options">
      {inquiry.options.map((option) => {
        const icon = generateOptionIcon(option);
        return (
          <button
            key={option.id}
            type="button"
            {...(withTestIds
              ? { 'data-testid': `inquiry-opt-${inquiry.hookRequestId}-${option.id}` }
              : {})}
            className={clsx(
              'wr-inq-opt',
              option.tone === 'danger' && 'wr-inq-opt--danger',
              option.tone === 'primary' && 'wr-inq-opt--primary',
            )}
            title={option.detail ?? option.caption}
            onClick={() => onChoose(option)}
          >
            <span className="wr-inq-opt-icon" aria-hidden dangerouslySetInnerHTML={{ __html: icon.svg }} />
            <span className="wr-inq-opt-caption">{option.caption}</span>
          </button>
        );
      })}
    </div>
  );
}

interface StampGhost {
  hookRequestId: string;
  question: string;
  caption: string;
  unitId: string;
  adapter: string;
}

export function ChatDock({ store, orders }: ChatDockProps): React.JSX.Element | null {
  const inquiries = useStore(store, (s) => s.board.inquiries);
  const agents = useStore(store, (s) => s.board.agents);
  const pulse = useStore(store, (s) => s.meta.dockPulse);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [ghosts, setGhosts] = useState<StampGhost[]>([]);
  const [pulsing, setPulsing] = useState(false);

  // Space pulse: scroll the dock into view + highlight (SPEC-V3 §V3-5).
  useEffect(() => {
    if (pulse === 0) return;
    rootRef.current?.scrollIntoView({ block: 'nearest' });
    setPulsing(true);
    const timer = window.setTimeout(() => setPulsing(false), PULSE_MS);
    return () => window.clearTimeout(timer);
  }, [pulse]);

  const { visible, overflow } = dockView(inquiries);
  if (visible.length === 0 && ghosts.length === 0) return null;

  const choose = (inquiry: SimInquiryView, option: SimInquiryOption): void => {
    const adapter = agents[inquiry.unitId]?.agent ?? 'claude-code';
    // Keep the resolved bubble for the agent's transcript (§V3-5).
    store.getState().recordResolvedInquiry({
      hookRequestId: inquiry.hookRequestId,
      unitId: inquiry.unitId,
      taskId: inquiry.taskId,
      question: inquiry.question,
      optionId: option.id,
      caption: option.caption,
      ...(option.tone !== undefined ? { tone: option.tone } : {}),
    });
    orders.answerInquiry(inquiry.hookRequestId, option.id);
    // Brief wax-stamp ghost (visual residue only — NO inquiry testid).
    const ghost: StampGhost = {
      hookRequestId: inquiry.hookRequestId,
      question: inquiry.question,
      caption: option.caption,
      unitId: inquiry.unitId,
      adapter,
    };
    setGhosts((g) => [ghost, ...g]);
    window.setTimeout(() => {
      setGhosts((g) => g.filter((x) => x.hookRequestId !== ghost.hookRequestId));
    }, STAMP_MS);
  };

  return (
    <div
      ref={rootRef}
      className={clsx('wr-dock', pulsing && 'is-pulsing')}
      data-testid="chat-dock"
      aria-label="Inquiry dock"
    >
      <div className="wr-dock-title">
        INQUIRIES
        {overflow > 0 && <span className="wr-dock-more">+{overflow} more</span>}
      </div>
      <div className="wr-dock-stack">
        {ghosts.map((ghost) => {
          const portrait = generateIcon({ entityId: ghost.unitId, kind: 'unit', adapter: ghost.adapter });
          return (
            <div key={`ghost-${ghost.hookRequestId}`} className="wr-inq wr-inq--stamped" aria-hidden>
              <span className="wr-inq-portrait" dangerouslySetInnerHTML={{ __html: portrait.svg }} />
              <div className="wr-inq-main">
                <div className="wr-inq-question">{ghost.question}</div>
                <div className="wr-inq-resolved">{ghost.caption}</div>
              </div>
              <span className="wr-inq-stamp" />
            </div>
          );
        })}
        {visible.map((inquiry) => {
          const adapter = agents[inquiry.unitId]?.agent ?? 'claude-code';
          const portrait = generateIcon({ entityId: inquiry.unitId, kind: 'unit', adapter });
          return (
            <div
              key={inquiry.hookRequestId}
              className="wr-inq"
              data-testid={`inquiry-${inquiry.hookRequestId}`}
            >
              <span
                className={`wr-inq-portrait wr-faction-text--${adapter}`}
                title={inquiry.unitId}
                dangerouslySetInnerHTML={{ __html: portrait.svg }}
              />
              <div className="wr-inq-main">
                <div className="wr-inq-question">{inquiry.question}</div>
                <InquiryOptionRow inquiry={inquiry} onChoose={(option) => choose(inquiry, option)} withTestIds />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
