export function scrollToElementWithNavbarOffset(element: HTMLElement | null, navbarHeight = 84) {
  if (!element) {
    return;
  }

  const elementPosition = element.getBoundingClientRect().top;
  const offsetPosition = elementPosition + window.pageYOffset - navbarHeight;

  window.scrollTo({
    top: offsetPosition,
    behavior: 'smooth'
  });
}
