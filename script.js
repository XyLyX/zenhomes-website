// Nav background on scroll
const nav = document.getElementById('siteNav');
if(nav){
  window.addEventListener('scroll', () => {
    if(window.scrollY > 40){ nav.classList.add('scrolled'); }
    else{ nav.classList.remove('scrolled'); }
  }, { passive:true });
}

// Mobile nav toggle
const navToggle = document.getElementById('navToggle');
const navLinks = document.querySelector('.nav-links');
if(navToggle && navLinks){
  navToggle.addEventListener('click', () => {
    navLinks.classList.add('open');
    document.body.style.overflow = 'hidden';
  });
}
document.addEventListener('click', (e) => {
  if(e.target.classList.contains('nav-close') || (navLinks && navLinks.classList.contains('open') && e.target.tagName === 'A')){
    navLinks.classList.remove('open');
    document.body.style.overflow = '';
  }
});

// Scroll reveal
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if(!prefersReduced){
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if(entry.isIntersecting){
        entry.target.classList.add('in-view');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  document.querySelectorAll('.reveal-up, .ledger-row').forEach(el => observer.observe(el));
} else {
  document.querySelectorAll('.reveal-up, .ledger-row').forEach(el => el.classList.add('in-view'));
}

// Pre-fill contact form from a listing enquiry link (?listing=Name)
const params = new URLSearchParams(window.location.search);
const listingParam = params.get('listing');
const messageField = document.getElementById('message');
const interestField = document.getElementById('interest');
if(listingParam && messageField){
  messageField.value = `I would like more information regarding: ${decodeURIComponent(listingParam)}`;
}
if(listingParam && interestField){
  interestField.value = 'Luxury Residences';
}

// Contact form: submits natively to Netlify Forms (captured in the Netlify dashboard) when
// this site is hosted on Netlify. If that submission fails — e.g. running somewhere without
// form-handling support — it falls back to opening a pre-filled email instead.
const contactForm = document.getElementById('contactForm');
if(contactForm){
  contactForm.addEventListener('submit', function(e){
    e.preventDefault();
    const status = document.getElementById('formStatus');
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const company = document.getElementById('company').value.trim();
    const portfolioSize = document.getElementById('portfolio_size').value;
    const investmentRange = document.getElementById('investment_range').value;
    const holdPeriod = document.getElementById('hold_period').value;
    const liquidity = document.getElementById('liquidity_timeframe').value;
    const targetReturn = document.getElementById('target_return').value;
    const objective = document.getElementById('objective').value;
    const interest = document.getElementById('interest').value;
    const propertyCategory = document.getElementById('property_category').value;
    const message = document.getElementById('message').value.trim();

    const formData = new FormData(contactForm);
    const encoded = new URLSearchParams(formData).toString();

    fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: encoded
    }).then((res) => {
      if(!res.ok) throw new Error('Form endpoint unavailable');
      if(status){
        status.textContent = 'Thank you — your enquiry has been sent. We will respond directly and discreetly.';
        status.classList.add('show');
      }
      contactForm.reset();
    }).catch(() => {
      // Fallback: open a pre-filled email so the enquiry is never lost
      const subject = `Private Consultation Request — ${name || 'New Enquiry'}`;
      const body =
`Name: ${name}
Email: ${email}
Phone: ${phone}
Company / Family Office: ${company}

What They Need: ${objective}
Portfolio Size: ${portfolioSize}
Investment Range: ${investmentRange}
Hold Period: ${holdPeriod}
Liquidity / Timeframe: ${liquidity}
Target Return: ${targetReturn}

Area of Interest: ${interest}
Property Category: ${propertyCategory}

Anything Else:
${message}`;
      const mailto = `mailto:hello@zenhomesglobal.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      if(status){
        status.textContent = 'Opening your email client to send this enquiry to hello@zenhomesglobal.com…';
        status.classList.add('show');
      }
      window.location.href = mailto;
    });
  });
}

// Newsletter form: submits natively to Netlify Forms, same as the contact form, and shows
// an inline confirmation instead of navigating away to Netlify's default success page.
const newsletterForm = document.getElementById('newsletterForm');
if(newsletterForm){
  newsletterForm.addEventListener('submit', function(e){
    e.preventDefault();
    const status = document.getElementById('newsletterStatus');
    const formData = new FormData(newsletterForm);
    const encoded = new URLSearchParams(formData).toString();

    fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: encoded
    }).then((res) => {
      if(!res.ok) throw new Error('Form endpoint unavailable');
      if(status){
        status.textContent = "You're on the list — look out for our next market note.";
        status.classList.add('show');
      }
      newsletterForm.reset();
    }).catch(() => {
      if(status){
        status.textContent = 'Something went wrong. Email hello@zenhomesglobal.com and we\'ll add you directly.';
        status.classList.add('show');
      }
    });
  });
}
