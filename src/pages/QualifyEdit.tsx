import { useParams } from 'react-router-dom';
import QualifyNew from './QualifyNew';

export default function QualifyEdit() {
  const { id } = useParams();
  // For now, redirect to same form — loading existing data will come next iteration
  return <QualifyNew />;
}
