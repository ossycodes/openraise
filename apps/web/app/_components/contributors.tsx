import { Heart, Trophy } from 'lucide-react';
import { formatMoney } from '@openraise/shared';
import type { Supporter } from '../_lib/campaign';
export function Contributors({
  recent,
  top,
}: {
  recent: Supporter[] | null;
  top: Supporter[] | null;
}) {
  return (
    <div className="contributor-columns">
      {[
        {
          title: 'Recent contributors',
          items: recent,
          top: false,
          description: 'The latest confirmed gifts.',
        },
        {
          title: 'Top contributors',
          items: top,
          top: true,
          description: 'Combined confirmed giving per supporter.',
        },
      ].map((list) => (
        <div className="contributor-column" key={list.title}>
          <div className="contributor-heading">
            <span
              className={list.top ? 'contributor-icon top' : 'contributor-icon'}
            >
              {list.top ? (
                <Trophy size={19} aria-hidden="true" />
              ) : (
                <Heart size={19} aria-hidden="true" />
              )}
            </span>
            <div>
              <h3>{list.title}</h3>
              <p>{list.description}</p>
            </div>
          </div>
          {list.items === null ? (
            <p className="empty-copy">
              {list.top ? 'Top contributors' : 'Recent donations'} are
              unavailable right now. The total above still reflects confirmed
              payments.
            </p>
          ) : list.items.length ? (
            <ol className="contributor-list">
              {list.items.map((item, i) => (
                <li key={item.id}>
                  <span
                    className={
                      list.top
                        ? 'contributor-avatar ranked'
                        : 'contributor-avatar'
                    }
                    aria-hidden="true"
                  >
                    {list.top ? (
                      String(i + 1).padStart(2, '0')
                    ) : (
                      <Heart size={15} />
                    )}
                  </span>
                  <div>
                    <strong>A supporter</strong>
                    <small>
                      {list.top
                        ? 'Total contributed'
                        : new Intl.DateTimeFormat('en-GB', {
                            dateStyle: 'medium',
                            timeZone: 'Africa/Lagos',
                          }).format(new Date(item.confirmedAt))}
                    </small>
                  </div>
                  <b>{formatMoney(BigInt(item.amount), item.currency)}</b>
                </li>
              ))}
            </ol>
          ) : (
            <div className="contributor-empty">
              <Heart size={25} strokeWidth={1.2} aria-hidden="true" />
              <h4>Room for the first kind act.</h4>
              <p>Confirmed donations will appear here.</p>
              <a href="#donate">Support this campaign →</a>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
