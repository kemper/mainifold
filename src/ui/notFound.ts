export interface NotFoundCallbacks {
  onGoHome: () => void;
}

export function createNotFoundPage(
  container: HTMLElement,
  callbacks: NotFoundCallbacks,
): HTMLElement {
  const page = document.createElement('div');
  page.id = 'not-found-page';
  page.className = 'flex flex-col items-center justify-center w-full h-full bg-zinc-900 text-zinc-100';

  const code = document.createElement('div');
  code.className = 'text-7xl font-bold text-zinc-700 mb-4';
  code.textContent = '404';

  const message = document.createElement('p');
  message.className = 'text-lg text-zinc-400 mb-8';
  message.textContent = 'Page not found';

  const homeBtn = document.createElement('button');
  homeBtn.className = 'px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors';
  homeBtn.textContent = 'Go home';
  homeBtn.addEventListener('click', callbacks.onGoHome);

  page.append(code, message, homeBtn);
  container.appendChild(page);
  return page;
}
