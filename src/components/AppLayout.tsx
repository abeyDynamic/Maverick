import GlobalEiborBar from './GlobalEiborBar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <GlobalEiborBar />
    </>
  );
}
