import SalesList from '../components/lists/SalesList.jsx';

export default function VentasView() {
  return (
    <div className="h-full overflow-y-auto px-4 py-4 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <SalesList />
      </div>
    </div>
  );
}
