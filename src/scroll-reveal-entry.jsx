/**
 * React island that mounts the React Bits <ScrollReveal /> component into the
 * static Drift & Co. page (index.html). The entry is referenced from the page
 * with a Vite-processed module script, so it renders inside the live site.
 */

import { createRoot } from 'react-dom/client';
import ScrollReveal from './components/ScrollReveal/ScrollReveal.jsx';
import './styles/scroll-reveal-section.css';

const MANIFESTO_COPY =
  'What makes a perfume unforgettable? Not the glass, not the gold cap, not the name on the label. A fragrance lives the moment it becomes somebody\u2019s memory. That is why we still compound every bottle by hand, at thirty percent, since 2010.';

function ManifestoSection() {
  return (
    <section id="manifesto" className="drift-manifesto" aria-label="Our craft in words">
      <div className="drift-manifesto-inner">
        <span className="drift-manifesto-eyebrow">Our Craft in Words</span>
        <span className="drift-manifesto-rule" aria-hidden="true" />
        <ScrollReveal
          baseOpacity={0}
          enableBlur={true}
          baseRotation={4}
          blurStrength={6}
          containerClassName="drift-manifesto-heading"
          textClassName="drift-manifesto-text"
        >
          {MANIFESTO_COPY}
        </ScrollReveal>
        <span className="drift-manifesto-caption">
          Hand-blended Eau de Parfum &middot; 30% Fragrance Oil &middot; USA & Germany
        </span>
      </div>
    </section>
  );
}

const mountNode = document.getElementById('scroll-reveal-root');

if (mountNode) {
  window.__reactScrollRevealMounted = true;
  createRoot(mountNode).render(<ManifestoSection />);
}
