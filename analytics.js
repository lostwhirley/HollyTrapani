// GA4 event tracking shared by every page. Load after the gtag.js snippet.
//
// Events sent to GA4:
//   phone_click    - any tel: link
//   text_click     - any sms: link
//   email_click    - any mailto: link
//   generate_lead  - any inquiry/contact form submitted
//   listing_click  - a property card opened (call trackListingClick from the card's click handler)
//
// Every event carries link_location (which part of which page it came from).
(function () {
  function send(name, params) {
    if (typeof gtag === 'function') gtag('event', name, params);
  }

  // Describes where on the site an element sits, e.g. "home: nav" or "listing: contact form"
  function locationOf(el) {
    var path = location.pathname.replace(/\/index\.html$/, '/');
    var page = path === '/' || path === '' ? 'home' : path.replace(/^\/|\/$/g, '');
    var area = el.closest('nav') ? 'nav'
      : el.closest('.mobile-cta') ? 'mobile call/text buttons'
      : el.closest('footer') ? 'footer'
      : el.closest('form') ? 'contact form'
      : el.closest('#contact, .contact-section, .get-in-touch, [class*="contact"]') ? 'contact section'
      : 'page';
    return page + ': ' + area;
  }

  document.addEventListener('click', function (e) {
    var link = e.target.closest('a[href]');
    if (!link) return;
    var href = link.getAttribute('href').toLowerCase();
    var params = { link_location: locationOf(link) };
    if (href.indexOf('tel:') === 0) send('phone_click', params);
    else if (href.indexOf('sms:') === 0) send('text_click', params);
    else if (href.indexOf('mailto:') === 0) send('email_click', params);
  }, true);

  document.addEventListener('submit', function (e) {
    var form = e.target;
    var property = form.querySelector('input[name="property"]');
    send('generate_lead', {
      link_location: locationOf(form),
      property: property && property.value ? property.value : undefined
    });
  }, true);

  // Called by listing/rental card click handlers before navigating to the detail page.
  window.trackListingClick = function (listing, listingType) {
    var l = listing || {};
    var home = (l.data && l.data.home) || l;
    var addr = (home.location && home.location.address) || {};
    var address = addr.line || [addr.street_number, addr.street_name, addr.street_suffix].filter(Boolean).join(' ');
    send('listing_click', {
      listing_type: listingType,
      listing_address: [address, addr.city].filter(Boolean).join(', ') || undefined,
      listing_price: home.list_price || undefined,
      listing_id: l.listing_id || home.listing_id || l.property_id || home.property_id || undefined
    });
  };
})();
