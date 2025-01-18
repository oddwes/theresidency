import React from 'react';

interface RankingCardProps {
  title: string;
  data: { location: string; count: number }[];
}

const RankingCard: React.FC<RankingCardProps> = ({ title, data }) => {
  return (
    <div className="bg-gray-50 rounded-lg p-6">
      <h2 className="text-xl font-semibold mb-4">{title}</h2>
      <div className="space-y-2">
        {data.map(({ location, count }, index) => (
          <div key={location}>
            <span className="w-8 font-bold text-gray-500">{index + 1}.</span>
            <span> {location} </span>
            {typeof count === 'number' ? (
              <span className="font-semibold text-gray-700">
                {count.toLocaleString(undefined, {
                  style: title.toLowerCase().includes('mrr') ||
                          title.toLowerCase().includes('valuation') ||
                          title.toLowerCase().includes('raised amount')
                    ? 'currency'
                    : 'decimal',
                  currency: 'USD',
                  maximumFractionDigits: 0,
                })}
              </span>
            ) : (
              <span className="font-semibold text-gray-700">{count}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default RankingCard;