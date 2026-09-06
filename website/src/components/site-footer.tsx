import { siteContent } from '../site-content';

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-container site-footer__inner">
        <p className="site-footer__identity">
          <span>{siteContent.identity.productName}</span>
          <span>from {siteContent.identity.familyName}</span>
        </p>
        <nav aria-label={siteContent.footerLabel}>
          <div className="footer-groups">
            {siteContent.footerGroups.map(group => (
              <section className="footer-group" key={group.label}>
                <h2>{group.label}</h2>
                <ul className="footer-links">
                  {group.links.map(link => (
                    <li key={link.href}>
                      <a href={link.href}>{link.label}</a>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </nav>
      </div>
    </footer>
  );
}
