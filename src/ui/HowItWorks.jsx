/**
 * "How it works": a pill beside the sound toggle that opens a short card
 * explaining the piece, with the data credits underneath. It keeps the side
 * panel for the live readouts and puts the reading matter one click away.
 */
import { useEffect, useRef } from 'react';

export function HowItWorksButton({ open, onToggle }) {
  return (
    <button
      type="button"
      className="pill info"
      aria-expanded={open}
      aria-controls="howto"
      onClick={onToggle}
    >
      <svg className="pill-icon" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M10 9v5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        <circle cx="10" cy="6.2" r="1.1" fill="currentColor" />
      </svg>
      How it works
    </button>
  );
}

/** The card's own × takes focus away with the card: give it back to the button that opened it. */
export function refocusHowButton() {
  document.querySelector('[aria-controls="howto"]')?.focus({ preventScroll: true });
}

export function HowItWorks({ open, onClose }) {
  const ref = useRef(null);

  // Esc or a click anywhere else closes it
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    const onDown = (e) => {
      if (ref.current?.contains(e.target) || e.target.closest?.('.pill.info')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="howto" id="howto" role="dialog" aria-label="How it works" ref={ref}>
      <button type="button" className="howto-close" onClick={() => { onClose(); refocusHowButton(); }} aria-label="Close">×</button>
      <h2>How it works</h2>
      <dl>
        <dt>The fly</dt>
        <dd>
          A real micro-CT scan of a fruit fly. Its right foreleg is rigged at load time,
          so it reaches for the lever, hauls it down and lets it spring back by itself.
        </dd>

        <dt>The brain</dt>
        <dd>
          60,001 real neurons drawn at their measured positions. A rate model runs over the
          measured wiring: the game pushes current into the real sensory and dopamine
          neurons, and what lights up after that is the wiring's doing. Between spins the
          fly's state keeps driving it, so the brain is never idle.
        </dd>

        <dt>The stake</dt>
        <dd>
          It stakes 1 to 5 credits a spin, and decides how much itself: low NPF makes it
          chase losses, a recent payout makes it bolder, the defensive state makes it
          careful, and so does what it has learned.
        </dd>

        <dt>Learning</dt>
        <dd>
          Its mushroom body learns the way a real fly's does. Losses weaken the synapses
          that say “approach”, payouts weaken the ones that say “avoid”. On these odds it
          learns the machine is bad — and it keeps playing anyway.
        </dd>

        <dt>Out of credit</dt>
        <dd>
          It panics, then gives up and lies still, heart almost stopped. It thinks it is
          dying. After a while someone feeds the machine and it comes round, warier than
          before.
        </dd>

        <dt>The odds</dt>
        <dd>One spin in seven pays. About half of every credit staked comes back.</dd>
      </dl>

      <p className="note">
        Anatomy and wiring are real: soma coordinates, cell types and
        {' '}<b>151.9 M</b> measured synapses from <b>MaleCNS v1.0</b>. Activity is a
        rate model run over that wiring — the game only injects current into
        the real sensory and dopaminergic populations, and the fly's standing
        state keeps driving it between spins. The mushroom body learns on
        that wiring too, and what it learns sets how the fly plays.
      </p>
      <p className="howto-links">
        <a href="/about.html">Read the full write-up</a> · <a href="/legal.html">Legal &amp; privacy</a>
      </p>
    </div>
  );
}
