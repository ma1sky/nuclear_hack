import { ActivityIndicator } from 'react-native';
import { Button, type ButtonProps } from './button';
import { Text } from './text';
import { colors } from '../../theme/tokens';

type ActionButtonProps = Omit<ButtonProps, 'children'> & { label: string; loading?: boolean };

/** Product wrapper over the vendored RNR Button: native touch size and busy semantics. */
export function ActionButton({ label, loading = false, disabled, variant = 'default', ...props }: ActionButtonProps) {
  const inverted = variant === 'default' || variant === 'destructive';
  return (
    <Button {...props} variant={variant} disabled={disabled || loading}
      accessibilityState={{ disabled: !!disabled || loading, busy: loading }}>
      {loading && <ActivityIndicator size="small" color={inverted ? colors.primaryForeground : colors.foreground} />}
      <Text className="min-w-0 shrink text-center text-base leading-6">{label}</Text>
    </Button>
  );
}
