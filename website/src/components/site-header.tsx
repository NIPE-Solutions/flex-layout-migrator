import { siteContent } from '../site-content';

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-container site-header__inner">
        <a className="wordmark" href="/" aria-label={`${siteContent.identity.productName} home`}>
          <span className="wordmark__node" aria-hidden="true" />
          <span>{siteContent.identity.productName}</span>
        </a>

        <nav className="primary-nav" aria-label={siteContent.navigationLabel}>
          {siteContent.navigation.map(item => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
          <a className="family-link" href={siteContent.links.nipeOpenSource.href}>
            {siteContent.links.nipeOpenSource.label}
          </a>
        </nav>
      </div>
    </header>
  );
}
