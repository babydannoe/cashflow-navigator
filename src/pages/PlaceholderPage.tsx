import { Construction } from 'lucide-react';

export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-center">
      <Construction className="h-10 w-10 text-muted-foreground mb-3" />
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="text-muted-foreground text-sm mt-1">Deze pagina wordt binnenkort gebouwd.</p>
    </div>
  );
}
