import type { FCC } from '@repo/ui/types/common';

export const Show: FCC<{ when?: boolean }> = (props) => {
  return <>{props.when ? <>{props.children}</> : null}</>;
};
