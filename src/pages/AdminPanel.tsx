import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft } from 'lucide-react';
import EiborManagement from '@/components/admin/EiborManagement';
import GlobalEiborBar from '@/components/GlobalEiborBar';

export default function AdminPanel() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-secondary">
      <header className="bg-primary text-primary-foreground">
        <div className="container mx-auto flex items-center gap-4 py-4 px-6">
          <Button variant="ghost" size="sm" className="text-primary-foreground hover:bg-accent" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-semibold">Admin Panel</h1>
        </div>
      </header>
      <GlobalEiborBar />
      <main className="container mx-auto px-6 py-8">
        <Tabs defaultValue="eibor">
          <TabsList className="mb-6">
            <TabsTrigger value="banks">Banks</TabsTrigger>
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="eibor">EIBOR Rates</TabsTrigger>
            <TabsTrigger value="notes">Qualification Notes</TabsTrigger>
            <TabsTrigger value="version">Version Log</TabsTrigger>
          </TabsList>
          <TabsContent value="banks">
            <Card className="bg-background"><CardHeader><CardTitle>Bank Management</CardTitle></CardHeader><CardContent><p className="text-muted-foreground">Bank management coming soon.</p></CardContent></Card>
          </TabsContent>
          <TabsContent value="products">
            <Card className="bg-background"><CardHeader><CardTitle>Product Management</CardTitle></CardHeader><CardContent><p className="text-muted-foreground">Product management coming soon.</p></CardContent></Card>
          </TabsContent>
          <TabsContent value="eibor">
            <EiborManagement />
          </TabsContent>
          <TabsContent value="notes">
            <Card className="bg-background"><CardHeader><CardTitle>Qualification Notes</CardTitle></CardHeader><CardContent><p className="text-muted-foreground">Qualification notes management coming soon.</p></CardContent></Card>
          </TabsContent>
          <TabsContent value="version">
            <Card className="bg-background"><CardHeader><CardTitle>Version Log</CardTitle></CardHeader><CardContent><p className="text-muted-foreground">Version log coming soon.</p></CardContent></Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
