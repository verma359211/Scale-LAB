export function AboutBuilder() {
  return <section className="builder-panel" id="about-builder" aria-labelledby="builder-title">
    <p className="hero-kicker">04 / Behind the build</p>
    <div className="builder-heading"><div><span className="builder-intro">Hey, I’m</span><h2 id="builder-title">Chandan Verma<span>.</span></h2></div><span className="builder-monogram" aria-hidden="true">cv<span>↗</span></span></div>
    <p className="builder-story">I like finding out what happens <em>after</em> the happy path.</p>
    <p className="builder-description">I built ScaleLab to turn system-design questions into working experiments. Real traffic, real infrastructure, and something new to learn when things break.</p>
    <nav className="builder-links" aria-label="Connect with Chandan Verma">
      <a className="builder-link portfolio-link" href="https://www.chandanverma.space" target="_blank" rel="noreferrer"><span className="builder-link-number">01 / Explore</span><strong>Portfolio <span aria-hidden="true">↗</span></strong><small>More things I’ve built</small></a>
      <a className="builder-link" href="https://github.com/verma359211" target="_blank" rel="noreferrer"><span className="builder-link-number">02 / Inspect</span><strong>GitHub <span aria-hidden="true">↗</span></strong><small>Look under the hood</small></a>
      <a className="builder-link linkedin-link" href="https://www.linkedin.com/in/cverma7" target="_blank" rel="noreferrer"><span className="builder-link-number">03 / Connect</span><strong>LinkedIn <span aria-hidden="true">↗</span></strong><small>Let’s talk engineering</small></a>
    </nav>
  </section>;
}
