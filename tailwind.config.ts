import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        gphoto: '#1a73e8',
      },
    },
  },
  plugins: [],
};

export default config;
