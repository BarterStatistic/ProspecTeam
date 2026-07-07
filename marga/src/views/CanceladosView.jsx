import CancelledList from '../components/lists/CancelledList.jsx';

export default function CanceladosView() {
  return (
    <div className="h-full overflow-y-auto px-4 py-4 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <CancelledList />
      </div>
    </div>
  );
}
