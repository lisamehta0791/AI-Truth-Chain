import { Wordmark } from "@/components/brand/Wordmark";

export function LandingFooter() {
  return (
    <footer className="ld-footer">
      <div className="ld-wrap ld-footer__row">
        <div className="ld-footer__brand">
          <Wordmark size={30} />
          <span>
            <span className="label-caps block text-white">Chain of Truth</span>
            <span className="text-cot-text3">AI-assisted evidence integrity for police and the judiciary.</span>
          </span>
        </div>
        <div className="ld-footer__meta">
          <span>MIT LICENSED</span>
          <span>
            <b>AI ASSISTS; HUMANS DECIDE</b>
          </span>
          <span>ALL DEMO DATA IS FICTIONAL</span>
        </div>
      </div>
    </footer>
  );
}
