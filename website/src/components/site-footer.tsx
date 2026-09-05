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
          <ul className="footer-links">
            {siteContent.footerLinks.map(link => (
              <li key={link.href}>
                <a href={link.href}>{link.label}</a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
