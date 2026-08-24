import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

const globalStyles = `
  html, body, #root {
    font-family: Trebuchet, "Trebuchet MS", Arial, sans-serif;
  }

  #root .css-text-146c3p1:not([style*="font-family"]),
  #root input,
  #root textarea,
  #root button {
    font-family: Trebuchet, "Trebuchet MS", Arial, sans-serif !important;
  }
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: globalStyles }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
