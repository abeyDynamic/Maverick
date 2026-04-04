import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';

export default function Results() {
  const { id } = useParams();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-secondary">
      <header className="bg-primary text-primary-foreground">
        <div className="container mx-auto flex items-center gap-4 py-4 px-6">
          <Button variant="ghost" size="sm" className="text-primary-foreground hover:bg-accent" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-semibold">Results — Bank Comparison</h1>
        </div>
      </header>
      <main className="container mx-auto px-6 py-8">
        <Card className="bg-background">
          <CardHeader><CardTitle>Qualification {id}</CardTitle></CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Bank comparison, cost breakdown, and what-if panel will be built in the next iteration. Save a qualification first!</p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
