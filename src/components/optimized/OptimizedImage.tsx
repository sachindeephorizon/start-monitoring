/**
 * Optimized Image Component
 * Uses regular Image component (fast-image was removed from dependencies)
 */

import React from 'react';
import { Image, ImageSourcePropType, ImageStyle, StyleProp } from 'react-native';

interface OptimizedImageProps {
  source: ImageSourcePropType;
  style?: StyleProp<ImageStyle>;
  resizeMode?: 'contain' | 'cover' | 'stretch' | 'center' | 'repeat';
}

const OptimizedImage: React.FC<OptimizedImageProps> = ({
  source,
  style,
  resizeMode = 'cover',
  ...props
}) => {
  return (
    <Image
      source={source}
      style={style}
      resizeMode={resizeMode}
      {...props}
    />
  );
};

export default OptimizedImage;

