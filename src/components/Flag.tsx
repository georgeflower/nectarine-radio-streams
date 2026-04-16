type Props = { code?: string; className?: string };

const Flag = ({ code, className }: Props) => {
  const cc = (code || "").trim().toLowerCase();
  if (!cc || cc.length !== 2) return null;
  return (
    <img
      src={`https://flagcdn.com/16x12/${cc}.png`}
      srcSet={`https://flagcdn.com/32x24/${cc}.png 2x`}
      width={16}
      height={12}
      alt={cc.toUpperCase()}
      loading="lazy"
      className={`inline-block align-[-2px] mr-1 ${className ?? ""}`}
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = "none";
      }}
    />
  );
};

export default Flag;
