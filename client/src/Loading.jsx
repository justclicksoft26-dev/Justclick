export default function Loading({ text = 'جاري التحميل...' }) {
  return (
    <div className="loading" role="status">
      <span className="spinner" />
      {text}
    </div>
  );
}
