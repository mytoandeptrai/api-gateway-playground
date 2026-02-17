'use client';

import type { FieldPath, FieldValues } from 'react-hook-form';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@repo/ui/components/form';
import { Label } from '@repo/ui/components/label';
import { RadioGroup, RadioGroupItem } from '@repo/ui/components/radio-group';
import type { BaseFormFieldProps, RadioGroupOption } from '@repo/ui/types/base-form';
import { cn } from '@repo/ui/lib/utils';

interface FormRadioGroupProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> extends BaseFormFieldProps<TFieldValues, TName> {
  options: RadioGroupOption[];
  orientation?: 'horizontal' | 'vertical';
  optionClassName?: string;
}

function FormRadioGroup<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  control,
  name,
  label,
  description,
  required,
  options,
  orientation = 'vertical',
  disabled,
  className,
  optionClassName,
}: FormRadioGroupProps<TFieldValues, TName>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          {label && (
            <FormLabel>
              {label}
              {required && <span className='ml-1 text-red-500'>*</span>}
            </FormLabel>
          )}
          {description && <FormDescription>{description}</FormDescription>}
          <FormControl>
            <RadioGroup
              onValueChange={field.onChange}
              value={field.value}
              disabled={disabled}
              className={orientation === 'horizontal' ? 'flex flex-row space-x-6' : 'space-y-2'}
            >
              {options.map((option) => (
                <div key={option.value} className={cn('flex items-center space-x-2', optionClassName)}>
                  <RadioGroupItem value={option.value} id={`${name}-${option.value}`} disabled={option.disabled} />
                  <Label
                    htmlFor={`${name}-${option.value}`}
                    className='font-medium text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70'
                  >
                    {option.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export { FormRadioGroup, type RadioGroupOption };
