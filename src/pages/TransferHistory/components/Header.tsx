export const Header = () => {
  return (
    <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 className="font-degular text-4xl font-bold tracking-normal text-white mb-2">
          Transfer History
        </h2>
        <p className="text-white/60 font-sans">View your transfer history</p>
      </div>
    </div>
  );
};
