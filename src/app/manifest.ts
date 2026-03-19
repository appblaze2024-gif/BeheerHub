import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'BeheerHub Management System',
    short_name: 'BeheerHub',
    description: 'Beheer en Onderhoud voor de Openbare Ruimte',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#009ee3',
    icons: [
      {
        src: 'https://i.ibb.co/DgYjGBTt/Ontwerp-zonder-titel-5.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: 'https://i.ibb.co/DgYjGBTt/Ontwerp-zonder-titel-5.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
