//! Domain logic. No GPUI here, so it compiles and tests in seconds.

/// A click counter that stops at `u32::MAX` instead of overflowing.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Counter(u32);

impl Counter {
    pub fn increment(self) -> Self {
        Self(self.0.saturating_add(1))
    }

    pub fn value(self) -> u32 {
        self.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn increments_and_saturates() {
        assert_eq!(Counter::default().increment().value(), 1);
        assert_eq!(Counter(u32::MAX).increment().value(), u32::MAX);
    }
}
