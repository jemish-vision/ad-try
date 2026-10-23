

function TypeShortName(type) {
    const shortform = type?.split(' ')
    ?.map(word => word[0]?.toUpperCase())
    ?.join('');
  return shortform
}

export default TypeShortName